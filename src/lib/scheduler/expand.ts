/**
 * Pattern → dated semester sessions, reconciled to an exact count.
 *
 * The weekly pattern is a template. Expanding it against the real calendar gives
 * a chronological candidate list per assignment, which almost never lands on the
 * exact `requiredSessions` figure: 3 cells/week × 14 weeks is 42 candidates for
 * an assignment that needs 40, and holidays can push it the other way.
 *
 *   surplus → distributed trim (never "keep the first N")
 *   deficit → search for extra valid (date, period, room) placements, ranked so
 *             the extras don't all land in the final week
 *
 * If a deficit cannot be closed the result is INFEASIBLE and says which
 * assignment failed and why. It never reports success with sessions missing.
 */

import type {
  AssignmentRef, DatedSession, Placement, RoomRef, SectionRef, FacultyRef,
  SchedulingRules, SlotRef, TeachingDay,
} from "./types";
import { eligibleRoomsFor } from "./rooms";
import { slotsInWindow, spanOf } from "./time";
import { buildWindows } from "./engine";
import { daysBetween } from "./calendar";

export interface PatternCell {
  assignmentId: string;
  day: number;        // day-of-week
  slotOrder: number;
  duration: number;
  roomId: string;
  locked?: boolean;
}

export interface ExpandInput {
  assignments: AssignmentRef[];
  pattern: PatternCell[];
  teachingDays: TeachingDay[];
  slots: SlotRef[];
  rooms: RoomRef[];
  sections: SectionRef[];
  faculty: FacultyRef[];
  schedulingRules: SchedulingRules;
  /** EXTRA classes already on the timetable — they occupy time but aren't counted. */
  fixedSessions?: DatedSession[];
}

export interface ExpandResult {
  sessions: DatedSession[];
  perAssignment: { assignmentId: string; label: string; required: number; scheduled: number }[];
  unscheduled: { assignment: string; reason: string }[];
  trimmed: number;
  added: number;
  feasible: boolean;
}

const key = (date: string, order: number) => `${date}:${order}`;

/** Occupancy over real dates, used to search for remainder placements. */
class DatedLedger {
  private section = new Map<string, Set<string>>();
  private faculty = new Map<string, Set<string>>();
  private room = new Map<string, Set<string>>();
  private sectionDay = new Map<string, number>();
  private facultyDay = new Map<string, number>();
  private assignmentDay = new Map<string, number>();
  private subjectDates = new Map<string, string[]>();

  private bucket(m: Map<string, Set<string>>, id: string) {
    let s = m.get(id);
    if (!s) { s = new Set(); m.set(id, s); }
    return s;
  }

  add(s: DatedSession, subjectSectionKey?: string) {
    for (const o of spanOf(s.slotOrder, s.duration)) {
      this.bucket(this.section, s.sectionId).add(key(s.date, o));
      this.bucket(this.faculty, s.facultyId).add(key(s.date, o));
      this.bucket(this.room, s.roomId).add(key(s.date, o));
    }
    this.sectionDay.set(`${s.sectionId}:${s.date}`, (this.sectionDay.get(`${s.sectionId}:${s.date}`) ?? 0) + s.duration);
    this.facultyDay.set(`${s.facultyId}:${s.date}`, (this.facultyDay.get(`${s.facultyId}:${s.date}`) ?? 0) + s.duration);
    if (s.assignmentId) {
      const k = `${s.assignmentId}:${s.date}`;
      this.assignmentDay.set(k, (this.assignmentDay.get(k) ?? 0) + 1);
    }
    const sk = subjectSectionKey ?? `${s.subjectId}:${s.sectionId}`;
    const list = this.subjectDates.get(sk) ?? [];
    list.push(s.date);
    this.subjectDates.set(sk, list);
  }

  isFree(kind: "section" | "faculty" | "room", id: string, date: string, orders: number[]) {
    const s = this[kind].get(id);
    if (!s) return true;
    return orders.every((o) => !s.has(key(date, o)));
  }

  sectionLoad(id: string, date: string) { return this.sectionDay.get(`${id}:${date}`) ?? 0; }
  facultyLoad(id: string, date: string) { return this.facultyDay.get(`${id}:${date}`) ?? 0; }
  assignmentCount(id: string, date: string) { return this.assignmentDay.get(`${id}:${date}`) ?? 0; }

  /** Longest run of consecutive busy periods the faculty would have that day. */
  consecutive(facultyId: string, date: string, extra: number[], allOrders: number[]) {
    const busy = this.faculty.get(facultyId) ?? new Set<string>();
    const add = new Set(extra);
    let run = 0, best = 0;
    for (const o of allOrders) {
      const isBusy = busy.has(key(date, o)) || add.has(o);
      run = isBusy ? run + 1 : 0;
      if (run > best) best = run;
    }
    return best;
  }

  freeWithin(sectionId: string, date: string, orders: number[], alsoTaken: number[] = []) {
    const busy = this.section.get(sectionId) ?? new Set<string>();
    const extra = new Set(alsoTaken);
    return orders.filter((o) => !busy.has(key(date, o)) && !extra.has(o)).length;
  }

  /** Days between `date` and the nearest existing session of the same course. */
  nearestSubjectGap(subjectSectionKey: string, date: string): number {
    const list = this.subjectDates.get(subjectSectionKey);
    if (!list?.length) return 99;
    let best = 99;
    for (const d of list) {
      const gap = Math.abs(daysBetween(d, date));
      if (gap < best) best = gap;
    }
    return best;
  }

  /** Idle periods the section would be left with that day, between its classes. */
  gapCount(sectionId: string, date: string, extra: number[], allOrders: number[]) {
    const busy = this.section.get(sectionId) ?? new Set<string>();
    const add = new Set(extra);
    const flags = allOrders.map((o) => busy.has(key(date, o)) || add.has(o));
    const first = flags.indexOf(true);
    const last = flags.lastIndexOf(true);
    if (first < 0) return 0;
    let gaps = 0;
    for (let i = first; i <= last; i++) if (!flags[i]) gaps++;
    return gaps;
  }
}

/**
 * Drops `surplus` items from `n` candidates, spread as evenly as the list allows.
 *
 * Returns the indices to REMOVE. Trimming evenly keeps a course's sessions
 * spread across the whole semester; trimming the tail would silently end a
 * course three weeks early, and trimming the head would delay its start.
 */
export function distributedTrimIndices(n: number, surplus: number): number[] {
  if (surplus <= 0) return [];
  if (surplus >= n) return Array.from({ length: n }, (_, i) => i);
  const drop = new Set<number>();
  // Place `surplus` marks at the centres of `surplus` equal buckets.
  for (let i = 0; i < surplus; i++) {
    const target = Math.floor(((i + 0.5) * n) / surplus);
    let idx = Math.min(n - 1, Math.max(0, target));
    // Nudge forward on collision so two marks never land on one index.
    let guard = 0;
    while (drop.has(idx) && guard < n) { idx = (idx + 1) % n; guard++; }
    drop.add(idx);
  }
  return [...drop].sort((a, b) => a - b);
}

export function expandToSemester(input: ExpandInput): ExpandResult {
  const {
    assignments, pattern, teachingDays, slots, rooms, sections, faculty, schedulingRules,
  } = input;

  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const facultyById = new Map(faculty.map((f) => [f.id, f]));
  const assignmentById = new Map(assignments.map((a) => [a.id, a]));
  const ordered = [...slots].sort((a, b) => a.order - b.order);
  const classOrders = ordered.filter((s) => s.kind === "CLASS").map((s) => s.order);
  const windows = buildWindows(ordered, schedulingRules.allowSessionsAcrossBreak);
  const afternoonOrders = slotsInWindow(ordered, schedulingRules.afternoonWindowStart, schedulingRules.afternoonWindowEnd);
  const totalDays = teachingDays.length;

  const label = (a: AssignmentRef) => `${a.subjectCode} · §${a.sectionNumber}`;

  // ── 1. Expand the pattern chronologically ────────────────────────────────
  const byWeekday = new Map<number, PatternCell[]>();
  for (const c of pattern) {
    const list = byWeekday.get(c.day) ?? [];
    list.push(c);
    byWeekday.set(c.day, list);
  }
  for (const list of byWeekday.values()) list.sort((a, b) => a.slotOrder - b.slotOrder);

  /** assignmentId → chronological candidate occurrences. */
  const candidates = new Map<string, DatedSession[]>();
  for (const day of teachingDays) {
    for (const cell of byWeekday.get(day.patternWeekday) ?? []) {
      const a = assignmentById.get(cell.assignmentId);
      if (!a) continue;
      const list = candidates.get(a.id) ?? [];
      list.push({
        assignmentId: a.id,
        date: day.date,
        day: day.weekday,
        slotOrder: cell.slotOrder,
        duration: cell.duration,
        sectionId: a.sectionId,
        subjectId: a.subjectId,
        facultyId: a.facultyId,
        roomId: cell.roomId,
        kind: a.kind,
        type: "REGULAR",
        locked: !!cell.locked,
      });
      candidates.set(a.id, list);
    }
  }

  // ── 2. Reconcile each assignment to exactly requiredSessions ─────────────
  const kept: DatedSession[] = [];
  const deficits: { assignment: AssignmentRef; missing: number }[] = [];
  const unscheduled: { assignment: string; reason: string }[] = [];
  let trimmed = 0;

  for (const a of assignments) {
    const list = candidates.get(a.id) ?? [];

    if (list.length <= a.requiredSessions) {
      kept.push(...list);
      if (list.length < a.requiredSessions) {
        deficits.push({ assignment: a, missing: a.requiredSessions - list.length });
      }
      continue;
    }

    // Surplus. Pinned occurrences are never trimmed, so only the rest are fair
    // game — spread the drops evenly across them.
    const surplus = list.length - a.requiredSessions;
    const movable = list.map((s, i) => ({ s, i })).filter((x) => !x.s.locked);
    const takeOut = Math.min(surplus, movable.length);
    const dropSet = new Set(
      distributedTrimIndices(movable.length, takeOut).map((j) => movable[j].i)
    );
    kept.push(...list.filter((_, i) => !dropSet.has(i)));
    trimmed += dropSet.size;

    if (takeOut < surplus) {
      // More pinned occurrences than requiredSessions allows. Refusing to break
      // a pin is the right call, but the exact count then cannot hold — surface
      // it rather than quietly publishing the wrong number.
      unscheduled.push({
        assignment: label(a),
        reason:
          `${list.length - dropSet.size} pinned session(s) exceed the required ${a.requiredSessions}. ` +
          `Unpin some occurrences or raise requiredSessions.`,
      });
    }
  }

  // ── 3. Seed the dated ledger with everything already fixed ───────────────
  const ledger = new DatedLedger();
  for (const s of kept) ledger.add(s);
  for (const s of input.fixedSessions ?? []) ledger.add(s);

  // ── 4. Close deficits with hard-constraint-checked remainder placements ──
  let added = 0;

  // Hardest first: the assignment needing the most extra sessions goes first,
  // while the calendar still has room.
  deficits.sort((x, y) => y.missing - x.missing || x.assignment.id.localeCompare(y.assignment.id));

  for (const { assignment: a, missing } of deficits) {
    const section = sectionById.get(a.sectionId);
    const fac = facultyById.get(a.facultyId);
    if (!section || !fac) {
      unscheduled.push({ assignment: label(a), reason: "Its section or faculty member is missing or inactive." });
      continue;
    }
    const eligible = eligibleRoomsFor(rooms, a, a.kind, section.strength);
    if (eligible.length === 0) {
      unscheduled.push({
        assignment: label(a),
        reason: `No room satisfies this assignment for ${section.strength} students (type, capabilities or capacity).`,
      });
      continue;
    }
    const blocked = new Set(fac.unavailability.map((u) => `${u.day}:${u.slotOrder}`));
    const subjectKey = `${a.subjectId}:${a.sectionId}`;

    let placedHere = 0;
    for (let n = 0; n < missing; n++) {
      const best = bestRemainder({
        a, section, fac, eligible, blocked, subjectKey,
        teachingDays, windows, classOrders, afternoonOrders, schedulingRules, ledger, totalDays,
      });
      if (!best) break;
      const s: DatedSession = {
        assignmentId: a.id,
        date: best.date,
        day: best.weekday,
        slotOrder: best.slotOrder,
        duration: a.duration,
        sectionId: a.sectionId,
        subjectId: a.subjectId,
        facultyId: a.facultyId,
        roomId: best.roomId,
        kind: a.kind,
        type: "REGULAR",
        locked: false,
      };
      kept.push(s);
      ledger.add(s);
      placedHere++;
      added++;
    }

    if (placedHere < missing) {
      unscheduled.push({
        assignment: label(a),
        reason:
          `Needs ${a.requiredSessions} sessions but only ${a.requiredSessions - (missing - placedHere)} could be placed. ` +
          `No teaching day has ${a.duration} contiguous free period(s) with a free compatible room where the section, ` +
          `${fac.name} and the per-day limits all allow another class.`,
      });
    }
  }

  // ── 5. Report ────────────────────────────────────────────────────────────
  kept.sort((x, y) => x.date.localeCompare(y.date) || x.slotOrder - y.slotOrder);

  const counts = new Map<string, number>();
  for (const s of kept) {
    if (s.type !== "REGULAR" || !s.assignmentId) continue;
    counts.set(s.assignmentId, (counts.get(s.assignmentId) ?? 0) + 1);
  }

  const perAssignment = assignments.map((a) => ({
    assignmentId: a.id,
    label: label(a),
    required: a.requiredSessions,
    scheduled: counts.get(a.id) ?? 0,
  }));

  return {
    sessions: kept,
    perAssignment,
    unscheduled,
    trimmed,
    added,
    feasible: perAssignment.every((p) => p.scheduled === p.required),
  };
}

/**
 * Ranks every legal remainder placement and returns the best one.
 *
 * Hard constraints filter first; the ranking that follows is exactly the order
 * the specification asks for — section balance, faculty balance, afternoon
 * break, subject spacing, consecutive burden, gaps, then tail distortion.
 */
function bestRemainder(ctx: {
  a: AssignmentRef;
  section: SectionRef;
  fac: FacultyRef;
  eligible: RoomRef[];
  blocked: Set<string>;
  subjectKey: string;
  teachingDays: TeachingDay[];
  windows: Map<number, number[][]>;
  classOrders: number[];
  afternoonOrders: number[];
  schedulingRules: SchedulingRules;
  ledger: DatedLedger;
  totalDays: number;
}): { date: string; weekday: number; slotOrder: number; roomId: string } | null {
  const {
    a, section, fac, eligible, blocked, subjectKey, teachingDays, windows,
    classOrders, afternoonOrders, schedulingRules, ledger, totalDays,
  } = ctx;
  const w = schedulingRules.weights;

  let best: { date: string; weekday: number; slotOrder: number; roomId: string } | null = null;
  let bestScore = Infinity;

  for (let di = 0; di < teachingDays.length; di++) {
    const day = teachingDays[di];

    // ── Hard ────────────────────────────────────────────────────────────
    if (ledger.assignmentCount(a.id, day.date) >= schedulingRules.maxSessionsPerAssignmentPerDay) continue;

    const secLoad = ledger.sectionLoad(section.id, day.date);
    if (secLoad + a.duration > schedulingRules.maxHoursPerDayPerSection) continue;
    const facLoad = ledger.facultyLoad(fac.id, day.date);
    if (facLoad + a.duration > fac.maxHoursPerDay) continue;

    for (const win of windows.get(a.duration) ?? []) {
      if (win.some((o) => blocked.has(`${day.patternWeekday}:${o}`))) continue;
      if (!ledger.isFree("section", section.id, day.date, win)) continue;
      if (!ledger.isFree("faculty", fac.id, day.date, win)) continue;
      if (ledger.consecutive(fac.id, day.date, win, classOrders) > schedulingRules.maxConsecutiveHoursPerFaculty) continue;

      // ── Soft, in the specified priority order ─────────────────────────
      let score = 0;
      score += secLoad * 10 * w.sectionBalance;               // 1. section daily balance
      score += facLoad * 8 * w.facultyBalance;                // 2. faculty daily balance

      if (schedulingRules.preferAfternoonBreak && afternoonOrders.length > 0) {   // 3. afternoon break
        const freeBefore = ledger.freeWithin(section.id, day.date, afternoonOrders);
        const freeAfter = ledger.freeWithin(section.id, day.date, afternoonOrders, win);
        if (freeBefore > 0 && freeAfter === 0) score += 40 * w.afternoonBreak;
      }

      const gap = ledger.nearestSubjectGap(subjectKey, day.date);        // 4. subject spacing
      if (gap === 0) score += 60 * w.subjectSpacing;
      else if (gap === 1) score += 24 * w.subjectSpacing;
      else if (gap === 2) score += 8 * w.subjectSpacing;

      const run = ledger.consecutive(fac.id, day.date, win, classOrders); // 5. consecutive burden
      score += Math.max(0, run - 2) * 6 * w.consecutive;

      const gaps = ledger.gapCount(section.id, day.date, win, classOrders); // 6. gap quality
      score += gaps * 4 * w.gaps;

      // 7. tail distortion — the last fifth of term costs progressively more, so
      // reconciled sessions spread out instead of piling into the final week.
      const position = totalDays > 1 ? di / (totalDays - 1) : 0;
      if (position > 0.8) score += ((position - 0.8) / 0.2) * 50 * w.tailDistribution;

      score += win[0] * 0.4; // mild morning preference, matching the pattern solver

      for (const room of eligible) {
        if (!ledger.isFree("room", room.id, day.date, win)) continue;
        const roomScore = score + (room.capacity - section.strength) * 0.3 * w.roomFit;
        if (roomScore < bestScore) {
          bestScore = roomScore;
          best = { date: day.date, weekday: day.weekday, slotOrder: win[0], roomId: room.id };
        }
      }
    }
  }

  return best;
}
