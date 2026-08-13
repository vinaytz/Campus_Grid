import type {
  Placement, Session, SolverInput, SolverResult, RoomRef, SlotRef,
} from "./types";

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

  occupy(s: Session, p: Placement, orders: number[], subjectId: string) {
    for (const o of orders) {
      this.set(this.section, s.sectionId).add(k(p.day, o));
      this.set(this.faculty, s.facultyId).add(k(p.day, o));
      this.set(this.room, p.roomId).add(k(p.day, o));
    }
    this.bump(this.sectionDayLoad, `${s.sectionId}:${p.day}`, orders.length);
    this.bump(this.facultyDayLoad, `${s.facultyId}:${p.day}`, orders.length);
    this.bump(this.facultyWeekLoad, s.facultyId, orders.length);
    this.bump(this.subjectDay, `${subjectId}:${s.sectionId}:${p.day}`, 1);
  }

  release(s: Session, p: Placement, orders: number[], subjectId: string) {
    for (const o of orders) {
      this.section.get(s.sectionId)?.delete(k(p.day, o));
      this.faculty.get(s.facultyId)?.delete(k(p.day, o));
      this.room.get(p.roomId)?.delete(k(p.day, o));
    }
    this.bump(this.sectionDayLoad, `${s.sectionId}:${p.day}`, -orders.length);
    this.bump(this.facultyDayLoad, `${s.facultyId}:${p.day}`, -orders.length);
    this.bump(this.facultyWeekLoad, s.facultyId, -orders.length);
    this.bump(this.subjectDay, `${subjectId}:${s.sectionId}:${p.day}`, -1);
  }

  consecutiveFor(facultyId: string, day: number, orders: number[], allOrders: number[]) {
    const busy = this.faculty.get(facultyId) ?? new Set();
    const taken = new Set(orders.map(String));
    let run = 0, best = 0;
    for (const o of allOrders) {
      const isBusy = busy.has(k(day, o)) || taken.has(String(o));
      run = isBusy ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best;
  }
}

/** Contiguous windows of `duration` slots that don't cross a break. */
function buildWindows(slots: SlotRef[], allowAcrossBreak: boolean) {
  const byDuration = new Map<number, number[][]>();
  for (const duration of [1, 2, 3]) {
    const windows: number[][] = [];
    for (let i = 0; i + duration <= slots.length; i++) {
      const span = slots.slice(i, i + duration);
      const teachable = span.filter((s) => s.kind === "CLASS");
      if (teachable.length < duration && !allowAcrossBreak) continue;
      if (span.some((s) => s.kind === "BREAK") && !allowAcrossBreak) continue;
      if (span[0].kind === "BREAK") continue;
      windows.push(span.map((s) => s.order));
    }
    byDuration.set(duration, windows);
  }
  return byDuration;
}

function roomFits(room: RoomRef, s: Session, strength: number) {
  if (s.fixedRoom) return room.id === s.fixedRoom;
  if (room.capacity < strength) return false;
  if (s.requiredRoomType) return room.type === s.requiredRoomType;
  if (s.kind === "LAB") return room.type === "LAB";
  return room.type !== "LAB";
}

export function solve(input: SolverInput): SolverResult {
  const started = Date.now();
  const rand = mulberry32(input.seed ?? 42);

  const slots = [...input.slots].sort((a, b) => a.order - b.order);
  const classOrders = slots.filter((s) => s.kind === "CLASS").map((s) => s.order);
  const windows = buildWindows(slots, input.rules.allowSessionsAcrossBreak);

  const sectionById = new Map(input.sections.map((s) => [s.id, s]));
  const facultyById = new Map(input.faculty.map((f) => [f.id, f]));
  const subjectOf = new Map(input.sessions.map((s) => [s.key, s.subjectId]));

  let ledger = new Ledger();

  /** Pinned entries occupy the board before the solver starts. */
  function seedLocked(target: Ledger) {
    for (const l of input.locked ?? []) {
      const orders = Array.from({ length: l.duration }, (_, i) => l.slotOrder + i);
      target.occupy(
        { sectionId: l.sectionId, facultyId: l.facultyId } as Session,
        l, orders, "locked"
      );
    }
  }
  seedLocked(ledger);

  // Precompute each session's eligible rooms so ordering can use domain size.
  const eligibleRooms = new Map<string, RoomRef[]>();
  for (const s of input.sessions) {
    const strength = sectionById.get(s.sectionId)?.strength ?? 0;
    const fits = input.rooms
      .filter((r) => roomFits(r, s, strength))
      // smallest adequate room first — keeps big halls free for big sections
      .sort((a, b) => a.capacity - b.capacity);
    eligibleRooms.set(s.key, fits);
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
    return sb - sa;
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
    const out: { p: Placement; score: number }[] = [];

    for (const day of input.days) {
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

        for (const room of rooms) {
          if (!ledger.free("room", room.id, day, win)) continue;

          // Soft preferences, lower is better.
          let score = 0;
          const sameSubjectToday =
            ledger.subjectDay.get(`${s.subjectId}:${s.sectionId}:${day}`) ?? 0;
          score += sameSubjectToday * 60;              // spread a course over the week
          score += secDay * 3;                          // balance section load
          score += (room.capacity - section.strength) * 0.4; // tight room fit
          if (section.homeRoom && room.id === section.homeRoom && s.kind !== "LAB") score -= 12;
          score += win[0] * 0.6;                        // fill the morning first
          score += rand() * 4;                          // break ties, enable restarts

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
      ledger.occupy(s, p, orders, s.subjectId);
      placements[s.key] = p;

      if (backtrack(i + 1)) return true;

      ledger.release(s, p, orders, s.subjectId);
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
      ledger.occupy(s, p, orders, s.subjectId);
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
      ledger.occupy(s, p, orders, s.subjectId);
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
    if (s.fixedRoom) return "The pinned room is unavailable for this session length.";
    return `No ${s.requiredRoomType ?? s.kind.toLowerCase()} room seats ${strength} students. Add a larger room or split the section.`;
  }
  if (s.duration > 1) {
    return `No run of ${s.duration} free periods left on any working day. Add periods, or shorten the session.`;
  }
  return "Every remaining period clashes for this section, faculty member, or room.";
}
