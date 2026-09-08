/**
 * Scores a finished dated timetable on the soft objectives.
 *
 * These never block anything — they turn "is this a good timetable?" into a
 * number an admin can compare between two drafts, plus warnings that point at
 * the worst offenders. Lower is better; 0 is a perfect schedule.
 *
 * Every component is normalised to roughly the same order of magnitude before
 * the configured weights are applied, so a weight of 1 really does mean "these
 * two objectives matter equally".
 */

import type {
  AssignmentRef, DatedSession, RoomRef, SchedulerRules, ScoreReport, SectionRef,
  SlotRef, TeachingDay, FacultyRef,
} from "./types";
import { slotsInWindow, spanOf } from "./time";
import { daysBetween } from "./calendar";

export interface ScoreInput {
  sessions: DatedSession[];
  assignments: AssignmentRef[];
  teachingDays: TeachingDay[];
  slots: SlotRef[];
  sections: SectionRef[];
  faculty: FacultyRef[];
  rooms: RoomRef[];
  rules: SchedulerRules;
}

/** Population standard deviation. */
function stdev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function scoreTimetable(input: ScoreInput): ScoreReport {
  const { sessions, assignments, teachingDays, slots, sections, faculty, rooms, rules } = input;
  const w = rules.weights;
  const warnings: string[] = [];

  const regular = sessions.filter((s) => s.type === "REGULAR");
  const classOrders = slots.filter((s) => s.kind === "CLASS").map((s) => s.order);
  const afternoon = slotsInWindow(slots, rules.afternoonWindowStart, rules.afternoonWindowEnd);
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const facultyById = new Map(faculty.map((f) => [f.id, f]));
  const assignmentById = new Map(assignments.map((a) => [a.id, a]));
  const dates = teachingDays.map((d) => d.date);

  if (regular.length === 0) {
    return { total: 0, breakdown: {}, warnings: ["The timetable has no dated sessions yet."] };
  }

  /** owner|date → set of occupied periods */
  const occupied = (pick: (s: DatedSession) => string) => {
    const m = new Map<string, Set<number>>();
    for (const s of regular) {
      const k = `${pick(s)}|${s.date}`;
      const set = m.get(k) ?? new Set<number>();
      for (const o of spanOf(s.slotOrder, s.duration)) set.add(o);
      m.set(k, set);
    }
    return m;
  };

  const sectionDays = occupied((s) => s.sectionId);
  const facultyDays = occupied((s) => s.facultyId);

  /* ── 1. Section daily load balance ───────────────────────────────────── */
  // Measured per section as the spread of its per-day period counts across the
  // days it actually teaches. A section with 8 periods on Monday and 1 on
  // Tuesday scores far worse than one with 4 and 5.
  let sectionBalance = 0;
  let worstSection = { id: "", spread: 0 };
  for (const section of sections) {
    const loads = dates.map((d) => sectionDays.get(`${section.id}|${d}`)?.size ?? 0);
    if (loads.length < 2) continue;
    const spread = stdev(loads);
    sectionBalance += spread;
    if (spread > worstSection.spread) worstSection = { id: section.id, spread };
  }
  sectionBalance = sections.length ? (sectionBalance / sections.length) * 10 : 0;
  if (worstSection.spread > 1.8) {
    warnings.push(
      `Section ${sectionById.get(worstSection.id)?.number ?? "?"} has an uneven daily load (±${worstSection.spread.toFixed(1)} periods).`
    );
  }

  /* ── 2. Faculty daily load balance ───────────────────────────────────── */
  let facultyBalance = 0;
  let worstFaculty = { id: "", spread: 0 };
  const activeFaculty = new Set(regular.map((s) => s.facultyId));
  for (const id of activeFaculty) {
    const loads = dates.map((d) => facultyDays.get(`${id}|${d}`)?.size ?? 0).filter((n) => n > 0);
    if (loads.length < 2) continue;
    const spread = stdev(loads);
    facultyBalance += spread;
    if (spread > worstFaculty.spread) worstFaculty = { id, spread };
  }
  facultyBalance = activeFaculty.size ? (facultyBalance / activeFaculty.size) * 10 : 0;
  if (worstFaculty.spread > 2) {
    warnings.push(
      `${facultyById.get(worstFaculty.id)?.name ?? "A faculty member"}'s teaching is concentrated unevenly across days.`
    );
  }

  /* ── 3. Afternoon free period, per section per day ───────────────────── */
  let afternoonPenalty = 0;
  let sectionDaysWithoutBreak = 0;
  let sectionDaysCounted = 0;
  if (rules.preferAfternoonBreak && afternoon.length > 0) {
    for (const [k, set] of sectionDays) {
      sectionDaysCounted++;
      const free = afternoon.filter((o) => !set.has(o)).length;
      if (free === 0) { afternoonPenalty += 1; sectionDaysWithoutBreak++; }
    }
    afternoonPenalty = sectionDaysCounted ? (afternoonPenalty / sectionDaysCounted) * 100 : 0;
    if (sectionDaysWithoutBreak > 0) {
      const pct = Math.round((sectionDaysWithoutBreak / sectionDaysCounted) * 100);
      warnings.push(
        `${sectionDaysWithoutBreak} section-day(s) — ${pct}% — have no free period between ` +
        `${rules.afternoonWindowStart} and ${rules.afternoonWindowEnd}.`
      );
    }
  }

  /* ── 4. Subject distribution ─────────────────────────────────────────── */
  // Sessions of one course should be spread through the term. Penalise pairs
  // that land on the same day, and pairs much closer together than an even
  // spread would put them.
  let spacingPenalty = 0;
  const stackedCourses: string[] = [];
  const byAssignment = new Map<string, string[]>();
  for (const s of regular) {
    if (!s.assignmentId) continue;
    const list = byAssignment.get(s.assignmentId) ?? [];
    list.push(s.date);
    byAssignment.set(s.assignmentId, list);
  }
  for (const [id, list] of byAssignment) {
    if (list.length < 2) continue;
    const sorted = [...list].sort();
    // Ideal spacing if the sessions were evenly spread over the term.
    const ideal = dates.length / list.length;
    let deviation = 0;
    let stackedHere = 0;
    for (let i = 1; i < sorted.length; i++) {
      const gap = Math.abs(daysBetween(sorted[i - 1], sorted[i]));
      if (gap === 0) { stackedHere++; deviation += 3; }
      else deviation += Math.max(0, (ideal * 1.4 - gap) / Math.max(1, ideal));
    }
    spacingPenalty += deviation / (sorted.length - 1);
    if (stackedHere > 0) {
      const a = assignmentById.get(id);
      if (a) stackedCourses.push(`${a.subjectCode} · §${a.sectionNumber}`);
    }
  }
  spacingPenalty = byAssignment.size ? (spacingPenalty / byAssignment.size) * 20 : 0;
  if (stackedCourses.length > 0) {
    warnings.push(
      stackedCourses.length === 1
        ? `${stackedCourses[0]} runs twice on the same day somewhere in the term.`
        : `${stackedCourses.length} courses run twice on the same day somewhere in the term, including ${stackedCourses[0]}.`
    );
  }

  /* ── 5. Excessive consecutive classes ────────────────────────────────── */
  let consecutivePenalty = 0;
  let longestRunSeen = 0;
  const runsOf = (m: Map<string, Set<number>>, cap: number) => {
    let penalty = 0;
    for (const set of m.values()) {
      const flags = classOrders.map((o) => set.has(o));
      let run = 0;
      for (const f of flags) {
        run = f ? run + 1 : 0;
        longestRunSeen = Math.max(longestRunSeen, run);
        if (run > cap) penalty += 1;
      }
    }
    return penalty;
  };
  consecutivePenalty += runsOf(sectionDays, 3);
  consecutivePenalty += runsOf(facultyDays, rules.maxConsecutiveHoursPerFaculty);
  consecutivePenalty = (consecutivePenalty / Math.max(1, sectionDays.size + facultyDays.size)) * 60;
  if (longestRunSeen >= 6) {
    warnings.push(`Somewhere in the term there is a run of ${longestRunSeen} back-to-back periods.`);
  }

  /* ── 6. Idle gaps ────────────────────────────────────────────────────── */
  let gapPenalty = 0;
  let gapTotal = 0;
  for (const m of [sectionDays, facultyDays]) {
    for (const set of m.values()) {
      const flags = classOrders.map((o) => set.has(o));
      const first = flags.indexOf(true);
      const last = flags.lastIndexOf(true);
      if (first < 0) continue;
      for (let i = first; i <= last; i++) if (!flags[i]) { gapPenalty += 1; gapTotal++; }
    }
  }
  gapPenalty = (gapPenalty / Math.max(1, sectionDays.size + facultyDays.size)) * 12;

  /* ── 7. Tail distribution ────────────────────────────────────────────── */
  // Compare how many sessions sit in the last 20% of teaching days against how
  // many would sit there under an even spread.
  let tailPenalty = 0;
  if (dates.length >= 5) {
    const cut = Math.floor(dates.length * 0.8);
    const tailDates = new Set(dates.slice(cut));
    const inTail = regular.filter((s) => tailDates.has(s.date)).length;
    const expected = regular.length * (dates.length - cut) / dates.length;
    if (expected > 0 && inTail > expected) {
      const excess = (inTail - expected) / expected;
      tailPenalty = excess * 60;
      if (excess > 0.35) {
        warnings.push(
          `${inTail} sessions fall in the last ${dates.length - cut} teaching day(s) — ` +
          `about ${Math.round(excess * 100)}% more than an even spread.`
        );
      }
    }
  }

  /* ── 8. Room suitability ─────────────────────────────────────────────── */
  // Wasted seats as a fraction of the room's capacity, averaged over sessions.
  // A section of 60 in a 120-seat auditorium scores 0.5; a tight fit scores ~0.
  let roomPenalty = 0;
  let roomCounted = 0;
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  for (const s of regular) {
    const section = sectionById.get(s.sectionId);
    const room = roomById.get(s.roomId);
    if (!section || !room || room.capacity <= 0) continue;
    roomCounted++;
    roomPenalty += Math.max(0, room.capacity - section.strength) / room.capacity;
  }
  roomPenalty = roomCounted ? (roomPenalty / roomCounted) * 30 : 0;

  const breakdown: Record<string, number> = {
    sectionBalance: round(sectionBalance * w.sectionBalance),
    facultyBalance: round(facultyBalance * w.facultyBalance),
    afternoonBreak: round(afternoonPenalty * w.afternoonBreak),
    subjectSpacing: round(spacingPenalty * w.subjectSpacing),
    consecutive: round(consecutivePenalty * w.consecutive),
    gaps: round(gapPenalty * w.gaps),
    tailDistribution: round(tailPenalty * w.tailDistribution),
    roomFit: round(roomPenalty * w.roomFit),
  };

  const total = round(Object.values(breakdown).reduce((a, b) => a + b, 0));

  return { total, breakdown, warnings };
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}
