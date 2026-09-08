import type {
  Placement, Session, SolverInput, SolverResult, RoomRef, SlotRef, SectionRef,
} from "./types";
import { eligibleRoomsFor, describeRequirement } from "./rooms";
import { minutesOf, slotsInWindow } from "./time";

/** Deterministic PRNG so a given seed always reproduces the same timetable. */
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const k = (day: number, order: number) => `${day}:${order}`;

/**
 * Occupancy ledger. Every hard "is X free?" question is an O(1) Set lookup,
 * which is what keeps backtracking cheap enough to run inside a request.
 */
class Ledger {
  section = new Map<string, Set<string>>();
  faculty = new Map<string, Set<string>>();
  room = new Map<string, Set<string>>();
  sectionDayLoad = new Map<string, number>();
  facultyDayLoad = new Map<string, number>();
  facultyWeekLoad = new Map<string, number>();
  /** subject+section seen on a day — used to spread a course across the week. */
  subjectDay = new Map<string, number>();
  /** assignment seen on a day — enforces MAX_SESSIONS_PER_ASSIGNMENT_PER_DAY. */
  assignmentDay = new Map<string, number>();

  private set(m: Map<string, Set<string>>, id: string) {
    let s = m.get(id);
    if (!s) { s = new Set(); m.set(id, s); }
    return s;
  }
  private bump(m: Map<string, number>, key: string, by: number) {
    m.set(key, (m.get(key) ?? 0) + by);
  }

  free(kind: "section" | "faculty" | "room", id: string, day: number, orders: number[]) {
    const s = this[kind].get(id);
    if (!s) return true;
    return orders.every((o) => !s.has(k(day, o)));
  }

  occupy(s: Session, p: Placement, orders: number[]) {
    for (const o of orders) {
      this.set(this.section, s.sectionId).add(k(p.day, o));
      this.set(this.faculty, s.facultyId).add(k(p.day, o));
      this.set(this.room, p.roomId).add(k(p.day, o));
    }
    this.bump(this.sectionDayLoad, `${s.sectionId}:${p.day}`, orders.length);
    this.bump(this.facultyDayLoad, `${s.facultyId}:${p.day}`, orders.length);
    this.bump(this.facultyWeekLoad, s.facultyId, orders.length);
    this.bump(this.subjectDay, `${s.subjectId}:${s.sectionId}:${p.day}`, 1);
    if (s.assignmentId) this.bump(this.assignmentDay, `${s.assignmentId}:${p.day}`, 1);
  }

  release(s: Session, p: Placement, orders: number[]) {
    for (const o of orders) {
      this.section.get(s.sectionId)?.delete(k(p.day, o));
      this.faculty.get(s.facultyId)?.delete(k(p.day, o));
      this.room.get(p.roomId)?.delete(k(p.day, o));
    }
    this.bump(this.sectionDayLoad, `${s.sectionId}:${p.day}`, -orders.length);
    this.bump(this.facultyDayLoad, `${s.facultyId}:${p.day}`, -orders.length);
    this.bump(this.facultyWeekLoad, s.facultyId, -orders.length);
    this.bump(this.subjectDay, `${s.subjectId}:${s.sectionId}:${p.day}`, -1);
    if (s.assignmentId) this.bump(this.assignmentDay, `${s.assignmentId}:${p.day}`, -1);
  }

  consecutiveFor(facultyId: string, day: number, orders: number[], allOrders: number[]) {
    const busy = this.faculty.get(facultyId) ?? new Set();
    const taken = new Set(orders);
    let run = 0, best = 0;
    for (const o of allOrders) {
      const isBusy = busy.has(k(day, o)) || taken.has(o);
      run = isBusy ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best;
  }

  /** Free slots the section still has inside a given set of orders, on a day. */
  freeWithin(sectionId: string, day: number, orders: number[], alsoTaken: number[] = []) {
    const busy = this.section.get(sectionId) ?? new Set();
    const extra = new Set(alsoTaken);
    return orders.filter((o) => !busy.has(k(day, o)) && !extra.has(o)).length;
  }
}

/**
 * Contiguous windows of `duration` teachable slots.
 *
 * Two slots are contiguous only when one ends exactly where the next begins. A
 * clock gap between periods is a real break, so a 3-hour lab may never span it
 * — that holds regardless of `allowAcrossBreak`, which governs only explicit
 * BREAK-kind periods (lunch, assembly).
 */
export function buildWindows(slots: SlotRef[], allowAcrossBreak: boolean) {
  const ordered = [...slots].sort((a, b) => a.order - b.order);
  const byDuration = new Map<number, number[][]>();

  for (const duration of [1, 2, 3]) {
    const windows: number[][] = [];
    outer:
    for (let i = 0; i + duration <= ordered.length; i++) {
      const span = ordered.slice(i, i + duration);
      if (span[0].kind === "BREAK") continue;
      for (let j = 0; j < span.length; j++) {
        if (span[j].kind === "BREAK" && !allowAcrossBreak) continue outer;
        if (j > 0 && minutesOf(span[j - 1].end) !== minutesOf(span[j].start)) continue outer;
      }
      windows.push(span.map((s) => s.order));
    }
    byDuration.set(duration, windows);
  }
  return byDuration;
}

export function solve(input: SolverInput): SolverResult {
  const started = Date.now();
  const rand = mulberry32(input.seed ?? 42);

  const slots = [...input.slots].sort((a, b) => a.order - b.order);
  const classOrders = slots.filter((s) => s.kind === "CLASS").map((s) => s.order);
  const windows = buildWindows(slots, input.rules.allowSessionsAcrossBreak);
  const afternoonOrders = slotsInWindow(
    slots, input.rules.afternoonWindowStart, input.rules.afternoonWindowEnd
  );

  const sectionById = new Map(input.sections.map((s) => [s.id, s]));
  const facultyById = new Map(input.faculty.map((f) => [f.id, f]));

  let ledger = new Ledger();

  /**
   * Pinned cells occupy the board before the solver starts.
   *
   * They carry their real assignment and subject where known, so a pinned cell
   * still consumes that assignment's one-per-day allowance and still counts
   * against spreading the subject through the week.
   */
  function seedLocked(target: Ledger) {
    for (const l of input.locked ?? []) {
      const orders = Array.from({ length: l.duration }, (_, i) => l.slotOrder + i);
      target.occupy(
        {
          sectionId: l.sectionId,
          facultyId: l.facultyId,
          subjectId: l.subjectId ?? `locked:${l.sessionKey}`,
          assignmentId: l.assignmentId ?? "",
        } as Session,
        l, orders
      );
    }
  }
  seedLocked(ledger);

  // Precompute each session's eligible rooms so ordering can use domain size.
  const eligibleRooms = new Map<string, RoomRef[]>();
  for (const s of input.sessions) {
    const strength = sectionById.get(s.sectionId)?.strength ?? 0;
    eligibleRooms.set(s.key, eligibleRoomsFor(input.rooms, s, s.kind, strength));
  }

  // A session with no eligible room at all can never be placed. Pull these out
  // first so one impossible request doesn't abort the search for everything else.
  const impossible = input.sessions.filter((s) => eligibleRooms.get(s.key)!.length === 0);
  const schedulable = input.sessions.filter((s) => eligibleRooms.get(s.key)!.length > 0);

  /** Most-constrained-first: long sessions with few rooms are placed early. */
  const order = [...schedulable].sort((a, b) => {
    const ra = eligibleRooms.get(a.key)!.length;
    const rb = eligibleRooms.get(b.key)!.length;
    if (ra !== rb) return ra - rb;
    if (a.duration !== b.duration) return b.duration - a.duration;
    const sa = sectionById.get(a.sectionId)?.strength ?? 0;
    const sb = sectionById.get(b.sectionId)?.strength ?? 0;
    if (sa !== sb) return sb - sa;
    return a.key.localeCompare(b.key); // stable for a given seed
  });

  let placements: Record<string, Placement> = {};
  const unplaced: SolverResult["unplaced"] = [];

  for (const s of impossible) {
    unplaced.push({
      key: s.key,
      label: `${s.subjectCode} · ${sectionById.get(s.sectionId)?.number ?? "?"}`,
      reason: diagnose(s, 0, sectionById.get(s.sectionId)?.strength ?? 0),
    });
  }

  // Deepest partial assignment seen — salvaged if the search runs out of budget.
  let bestDepth = -1;
  let bestSnapshot: Record<string, Placement> = {};
  let steps = 0;
  const STEP_BUDGET = 400_000;
  const TIME_BUDGET_MS = 12_000;

  function candidates(s: Session): Placement[] {
    const section = sectionById.get(s.sectionId);
    const fac = facultyById.get(s.facultyId);
    if (!section || !fac) return [];

    const blocked = new Set(fac.unavailability.map((u) => k(u.day, u.slotOrder)));
    const rooms = eligibleRooms.get(s.key)!;
    const w = input.rules.weights;
    const out: { p: Placement; score: number }[] = [];

    for (const day of input.days) {
      // ── Hard: same assignment must not exceed its per-day cap ──────────
      const sameAssignmentToday = ledger.assignmentDay.get(`${s.assignmentId}:${day}`) ?? 0;
      if (sameAssignmentToday >= input.rules.maxSessionsPerAssignmentPerDay) continue;

      const facDay = ledger.facultyDayLoad.get(`${fac.id}:${day}`) ?? 0;
      if (facDay + s.duration > fac.maxHoursPerDay) continue;
      const secDay = ledger.sectionDayLoad.get(`${section.id}:${day}`) ?? 0;
      if (secDay + s.duration > input.rules.maxHoursPerDayPerSection) continue;

      for (const win of windows.get(s.duration) ?? []) {
        if (win.some((o) => blocked.has(k(day, o)))) continue;
        if (!ledger.free("section", section.id, day, win)) continue;
        if (!ledger.free("faculty", fac.id, day, win)) continue;
        if (ledger.consecutiveFor(fac.id, day, win, classOrders) >
            input.rules.maxConsecutiveHoursPerFaculty) continue;

        // Soft preferences, lower is better.
        let base = 0;
        const sameSubjectToday =
          ledger.subjectDay.get(`${s.subjectId}:${s.sectionId}:${day}`) ?? 0;
        base += sameSubjectToday * 60 * w.subjectSpacing;   // spread a course over the week
        base += secDay * 3 * w.sectionBalance;              // balance the section's week
        base += facDay * 2 * w.facultyBalance;              // balance the faculty's week
        base += win[0] * 0.6;                               // fill the morning first

        // Afternoon free period: penalise a placement that would use up the
        // section's last free slot inside the configured window. Soft only —
        // it reorders candidates, it never removes one.
        if (input.rules.preferAfternoonBreak && afternoonOrders.length > 0) {
          const freeBefore = ledger.freeWithin(section.id, day, afternoonOrders);
          const freeAfter = ledger.freeWithin(section.id, day, afternoonOrders, win);
          if (freeBefore > 0 && freeAfter === 0) base += 45 * w.afternoonBreak;
        }

        for (const room of rooms) {
          if (!ledger.free("room", room.id, day, win)) continue;
          let score = base;
          score += (room.capacity - section.strength) * 0.4 * w.roomFit; // tight fit
          if (section.homeRoom && room.id === section.homeRoom && s.kind !== "LAB") score -= 12;
          score += rand() * 4;                              // break ties, enable restarts
          out.push({ p: { day, slotOrder: win[0], duration: s.duration, roomId: room.id }, score });
        }
      }
    }
    return out.sort((a, b) => a.score - b.score).slice(0, 40).map((c) => c.p);
  }

  function backtrack(i: number): boolean {
    if (i > bestDepth) {
      bestDepth = i;
      bestSnapshot = { ...placements };
    }
    if (i >= order.length) return true;
    if (steps > STEP_BUDGET || Date.now() - started > TIME_BUDGET_MS) return false;

    const s = order[i];
    const options = candidates(s);

    for (const p of options) {
      steps++;
      const orders = Array.from({ length: p.duration }, (_, n) => p.slotOrder + n);
      ledger.occupy(s, p, orders);
      placements[s.key] = p;

      if (backtrack(i + 1)) return true;

      ledger.release(s, p, orders);
      delete placements[s.key];
      if (steps > STEP_BUDGET || Date.now() - started > TIME_BUDGET_MS) return false;
    }
    return false;
  }

  const complete = backtrack(0);

  // Partial solve: restore the deepest assignment the search reached, then fill
  // the remainder greedily so a near-complete run isn't thrown away.
  if (!complete) {
    ledger = new Ledger();
    seedLocked(ledger);
    placements = {};

    const sessionByKey = new Map(order.map((s) => [s.key, s]));
    for (const [key, p] of Object.entries(bestSnapshot)) {
      const s = sessionByKey.get(key);
      if (!s) continue;
      const orders = Array.from({ length: p.duration }, (_, n) => p.slotOrder + n);
      ledger.occupy(s, p, orders);
      placements[key] = p;
    }

    for (const s of order) {
      if (placements[s.key]) continue;
      const options = candidates(s);
      if (options.length === 0) {
        unplaced.push({
          key: s.key,
          label: `${s.subjectCode} · ${sectionById.get(s.sectionId)?.number ?? "?"}`,
          reason: diagnose(s, eligibleRooms.get(s.key)!.length,
            sectionById.get(s.sectionId)?.strength ?? 0),
        });
        continue;
      }
      const p = options[0];
      const orders = Array.from({ length: p.duration }, (_, n) => p.slotOrder + n);
      ledger.occupy(s, p, orders);
      placements[s.key] = p;
    }
  }

  return {
    placements,
    unplaced,
    stats: {
      requested: input.sessions.length,
      placed: Object.keys(placements).length,
      steps,
      durationMs: Date.now() - started,
    },
  };
}

/** Turns a dead end into something an administrator can act on. */
function diagnose(s: Session, roomCount: number, strength: number) {
  if (roomCount === 0) {
    if (s.roomSelection === "FIXED") {
      return "The pinned room can't host this session — check its capacity, type and capabilities.";
    }
    if (s.roomSelection === "ALLOWED_ROOMS") {
      return `None of the ${s.allowedRooms.length} permitted room(s) seats ${strength} students with the required type and capabilities.`;
    }
    return `No ${describeRequirement(s, s.kind)} seats ${strength} students. Add a suitable room or split the section.`;
  }
  if (s.duration > 1) {
    return `No run of ${s.duration} contiguous free periods left on any teaching day. Add periods, or shorten the session.`;
  }
  return "Every remaining period clashes for this section, faculty member, or room.";
}
