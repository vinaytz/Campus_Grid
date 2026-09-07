/**
 * Server-side validation of a manual edit to a dated session.
 *
 * Every admin edit — move, room change, or an added extra class — routes through
 * here before it is written. The UI's optimistic checks are a convenience; this
 * is the enforcement point, so a hand-crafted request cannot bypass it.
 */

import type {
  AssignmentRef, DatedSession, FacultyRef, RoomRef, SchedulerRules, SectionRef,
  SlotRef, TeachingDay,
} from "./types";
import { roomSatisfies } from "./rooms";
import { spanIsContiguous, spanOf } from "./time";

export interface MoveRequest {
  /** The session being changed; omit for a brand-new extra class. */
  sessionId?: string;
  date: string;
  slotOrder: number;
  duration: number;
  sectionId: string;
  facultyId: string;
  roomId: string;
  kind: "LECTURE" | "LAB" | "TUTORIAL";
  type: "REGULAR" | "EXTRA";
  assignmentId?: string;
}

export interface MoveContext {
  /** All sessions currently on the timetable, including the one being moved. */
  sessions: (DatedSession & { id: string })[];
  assignments: AssignmentRef[];
  teachingDays: TeachingDay[];
  slots: SlotRef[];
  rooms: RoomRef[];
  sections: SectionRef[];
  faculty: FacultyRef[];
  rules: SchedulerRules;
}

export type MoveVerdict = { ok: true } | { ok: false; reasons: string[] };

/**
 * Checks a proposed placement against every hard constraint.
 *
 * Returns *all* blocking reasons rather than the first, because an admin
 * dragging a lab into a bad slot benefits from knowing it clashes AND that the
 * room is too small, instead of discovering the second problem after fixing the
 * first.
 */
export function validateMove(req: MoveRequest, ctx: MoveContext): MoveVerdict {
  const reasons: string[] = [];

  const section = ctx.sections.find((s) => s.id === req.sectionId);
  const fac = ctx.faculty.find((f) => f.id === req.facultyId);
  const room = ctx.rooms.find((r) => r.id === req.roomId);
  const assignment = req.assignmentId
    ? ctx.assignments.find((a) => a.id === req.assignmentId)
    : undefined;

  if (!section) reasons.push("That section no longer exists.");
  if (!fac) reasons.push("That faculty member no longer exists.");
  if (!room) reasons.push("That room no longer exists.");
  if (!section || !fac || !room) return { ok: false, reasons };

  // ── Calendar ──────────────────────────────────────────────────────────
  const day = ctx.teachingDays.find((d) => d.date === req.date);
  if (!day && req.type === "REGULAR") {
    reasons.push(`${req.date} is not a teaching day on this semester's calendar.`);
  }

  // ── Duration / contiguity ─────────────────────────────────────────────
  const span = spanIsContiguous(ctx.slots, req.slotOrder, req.duration, ctx.rules.allowSessionsAcrossBreak);
  if (!span.ok) reasons.push(span.reason);

  // ── Room compatibility ────────────────────────────────────────────────
  if (assignment) {
    const fit = roomSatisfies(room, assignment, req.kind, section.strength);
    if (!fit.ok) reasons.push(`${room.block}-${room.code}: ${fit.reason}`);
  } else if (room.capacity < section.strength) {
    reasons.push(`${room.block}-${room.code} seats ${room.capacity}, section has ${section.strength} students.`);
  }

  // ── Clashes, against every other session on that date ─────────────────
  const orders = new Set(spanOf(req.slotOrder, req.duration));
  const others = ctx.sessions.filter((s) => s.id !== req.sessionId && s.date === req.date);

  for (const other of others) {
    const overlaps = spanOf(other.slotOrder, other.duration).some((o) => orders.has(o));
    if (!overlaps) continue;

    if (other.sectionId === req.sectionId)
      reasons.push("The section already has a class in that period.");
    if (other.facultyId === req.facultyId)
      reasons.push(`${fac.name} is already teaching in that period.`);
    if (other.roomId === req.roomId)
      reasons.push(`${room.block}-${room.code} is already occupied in that period.`);
  }

  // ── Faculty availability ──────────────────────────────────────────────
  const patternWeekday = day?.patternWeekday ?? new Date(`${req.date}T00:00:00Z`).getUTCDay();
  if (fac.unavailability?.length) {
    const blocked = new Set(fac.unavailability.map((u) => `${u.day}:${u.slotOrder}`));
    if ([...orders].some((o) => blocked.has(`${patternWeekday}:${o}`))) {
      reasons.push(`${fac.name} is marked unavailable in that period.`);
    }
  }

  // ── Per-day caps ──────────────────────────────────────────────────────
  const sectionPeriods = new Set<number>();
  for (const s of others) {
    if (s.sectionId !== req.sectionId) continue;
    for (const o of spanOf(s.slotOrder, s.duration)) sectionPeriods.add(o);
  }
  if (sectionPeriods.size + req.duration > ctx.rules.maxHoursPerDayPerSection) {
    reasons.push(
      `Section ${section.number} would have ${sectionPeriods.size + req.duration} periods that day (cap ${ctx.rules.maxHoursPerDayPerSection}).`
    );
  }

  const facultyPeriods = new Set<number>();
  for (const s of others) {
    if (s.facultyId !== req.facultyId) continue;
    for (const o of spanOf(s.slotOrder, s.duration)) facultyPeriods.add(o);
  }
  if (facultyPeriods.size + req.duration > fac.maxHoursPerDay) {
    reasons.push(`${fac.name} would teach ${facultyPeriods.size + req.duration} periods that day (cap ${fac.maxHoursPerDay}).`);
  }

  const facultyClassOrders = ctx.slots.filter((s) => s.kind === "CLASS").map((s) => s.order);
  const facultyBusy = new Set<number>(facultyPeriods);
  for (const order of orders) facultyBusy.add(order);
  let run = 0;
  let longest = 0;
  for (const order of facultyClassOrders) {
    run = facultyBusy.has(order) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  if (longest > ctx.rules.maxConsecutiveHoursPerFaculty) {
    reasons.push(
      `${fac.name} would teach ${longest} consecutive periods (cap ${ctx.rules.maxConsecutiveHoursPerFaculty}).`
    );
  }

  const teachingWeek = day?.week;
  if (teachingWeek !== undefined) {
    const facultyWeekPeriods = ctx.sessions
      .filter((s) => s.id !== req.sessionId)
      .filter((s) => ctx.teachingDays.find((d) => d.date === s.date)?.week === teachingWeek)
      .filter((s) => s.facultyId === req.facultyId)
      .reduce((total, s) => total + s.duration, 0);
    if (facultyWeekPeriods + req.duration > fac.maxHoursPerWeek) {
      reasons.push(
        `${fac.name} would teach ${facultyWeekPeriods + req.duration} periods in teaching week ${teachingWeek} (cap ${fac.maxHoursPerWeek}).`
      );
    }
  }

  // ── Same assignment twice in one day ──────────────────────────────────
  if (req.type === "REGULAR" && req.assignmentId) {
    const already = others.filter(
      (s) => s.type === "REGULAR" && s.assignmentId === req.assignmentId
    ).length;
    if (already >= ctx.rules.maxSessionsPerAssignmentPerDay) {
      reasons.push(
        ctx.rules.maxSessionsPerAssignmentPerDay === 1
          ? "This class already meets once on that date."
          : `This class already meets ${ctx.rules.maxSessionsPerAssignmentPerDay} times on that date.`
      );
    }
  }

  return reasons.length ? { ok: false, reasons: [...new Set(reasons)] } : { ok: true };
}

/**
 * Rooms that could take this session on this date, free ones first.
 * Used by the inspector when an admin wants to move a class to another room.
 */
export function roomOptionsForMove(req: MoveRequest, ctx: MoveContext) {
  const section = ctx.sections.find((s) => s.id === req.sectionId);
  const assignment = req.assignmentId
    ? ctx.assignments.find((a) => a.id === req.assignmentId)
    : undefined;
  if (!section) return [];

  const orders = new Set(spanOf(req.slotOrder, req.duration));
  const busy = new Set(
    ctx.sessions
      .filter((s) => s.id !== req.sessionId && s.date === req.date)
      .filter((s) => spanOf(s.slotOrder, s.duration).some((o) => orders.has(o)))
      .map((s) => s.roomId)
  );

  return ctx.rooms
    .map((room) => {
      const fit = assignment
        ? roomSatisfies(room, assignment, req.kind, section.strength)
        : room.capacity >= section.strength
        ? ({ ok: true } as const)
        : ({ ok: false, reason: `Seats ${room.capacity}, section has ${section.strength}.` } as const);
      if (!fit.ok) return { room, free: false, tier: 2 as const, reason: fit.reason };
      if (busy.has(room.id)) return { room, free: false, tier: 1 as const, reason: "Occupied in that period." };
      return { room, free: true, tier: 0 as const };
    })
    .sort((a, b) => a.tier - b.tier || a.room.capacity - b.room.capacity);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Weekly-pattern validation
 * ──────────────────────────────────────────────────────────────────────────── */

export interface PatternCandidate {
  id?: string;
  assignmentId: string;
  day: number;
  slotOrder: number;
  duration: number;
  roomId: string;
}

export interface PatternContext {
  assignments: AssignmentRef[];
  slots: SlotRef[];
  rooms: RoomRef[];
  sections: SectionRef[];
  faculty: FacultyRef[];
  rules: SchedulerRules;
  /** Weekdays the pattern may use. */
  days: number[];
}

/**
 * Validates a whole weekly pattern in one pass.
 *
 * The Studio saves the layout wholesale, so the server checks it wholesale: a
 * hand-edited or replayed request cannot smuggle in a clash that the client-side
 * drag checks would have caught. Returns every problem found, capped so a badly
 * broken payload doesn't produce a wall of text.
 */
export function validatePattern(
  cells: PatternCandidate[],
  ctx: PatternContext,
  limit = 12
): { ok: true } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  const assignmentById = new Map(ctx.assignments.map((a) => [a.id, a]));
  const sectionById = new Map(ctx.sections.map((s) => [s.id, s]));
  const roomById = new Map(ctx.rooms.map((r) => [r.id, r]));
  const facultyById = new Map(ctx.faculty.map((f) => [f.id, f]));

  const claimed = { section: new Map<string, string>(), faculty: new Map<string, string>(), room: new Map<string, string>() };
  const sectionDay = new Map<string, number>();
  const facultyDay = new Map<string, number>();
  const assignmentDay = new Map<string, number>();

  for (const c of cells) {
    const a = assignmentById.get(c.assignmentId);
    if (!a) { reasons.push("A placed session refers to an assignment that no longer exists."); continue; }

    const section = sectionById.get(a.sectionId);
    const room = roomById.get(c.roomId);
    const fac = facultyById.get(a.facultyId);
    const label = `${a.subjectCode} · §${a.sectionNumber}`;

    if (!section || !room || !fac) {
      reasons.push(`${label} refers to a section, room or faculty member that no longer exists.`);
      continue;
    }

    if (!ctx.days.includes(c.day)) {
      reasons.push(`${label} is placed on a day that is not a teaching weekday.`);
    }

    const span = spanIsContiguous(ctx.slots, c.slotOrder, c.duration, ctx.rules.allowSessionsAcrossBreak);
    if (!span.ok) reasons.push(`${label}: ${span.reason}`);

    const fit = roomSatisfies(room, a, a.kind, section.strength);
    if (!fit.ok) reasons.push(`${label} in ${room.block}-${room.code}: ${fit.reason}`);

    if (c.duration !== a.duration) {
      reasons.push(`${label} is ${c.duration} period(s) long but the assignment specifies ${a.duration}.`);
    }

    for (const o of spanOf(c.slotOrder, c.duration)) {
      const cell = `${c.day}:${o}`;
      const check = (m: Map<string, string>, id: string, noun: string) => {
        const k = `${id}|${cell}`;
        const existing = m.get(k);
        if (existing) reasons.push(`${noun} is double-booked: ${existing} and ${label} overlap.`);
        else m.set(k, label);
      };
      check(claimed.section, a.sectionId, `Section ${section.number}`);
      check(claimed.faculty, a.facultyId, fac.name);
      check(claimed.room, c.roomId, `Room ${room.block}-${room.code}`);
    }

    if (fac.unavailability?.length) {
      const blocked = new Set(fac.unavailability.map((u) => `${u.day}:${u.slotOrder}`));
      if (spanOf(c.slotOrder, c.duration).some((o) => blocked.has(`${c.day}:${o}`))) {
        reasons.push(`${fac.name} is marked unavailable when ${label} is placed.`);
      }
    }

    const sk = `${a.sectionId}:${c.day}`;
    sectionDay.set(sk, (sectionDay.get(sk) ?? 0) + c.duration);
    const fk = `${a.facultyId}:${c.day}`;
    facultyDay.set(fk, (facultyDay.get(fk) ?? 0) + c.duration);
    const ak = `${a.id}:${c.day}`;
    assignmentDay.set(ak, (assignmentDay.get(ak) ?? 0) + 1);
  }

  for (const [k, n] of sectionDay) {
    if (n <= ctx.rules.maxHoursPerDayPerSection) continue;
    const number = sectionById.get(k.split(":")[0])?.number ?? "?";
    reasons.push(`Section ${number} has ${n} periods on one day (cap ${ctx.rules.maxHoursPerDayPerSection}).`);
  }
  for (const [k, n] of facultyDay) {
    const fac = facultyById.get(k.split(":")[0]);
    if (!fac || n <= fac.maxHoursPerDay) continue;
    reasons.push(`${fac.name} has ${n} periods on one day (cap ${fac.maxHoursPerDay}).`);
  }
  for (const [k, n] of assignmentDay) {
    if (n <= ctx.rules.maxSessionsPerAssignmentPerDay) continue;
    const a = assignmentById.get(k.split(":")[0]);
    reasons.push(
      `${a?.subjectCode ?? "A class"} · §${a?.sectionNumber ?? "?"} appears ${n} times on one day ` +
      `(cap ${ctx.rules.maxSessionsPerAssignmentPerDay}).`
    );
  }

  const unique = [...new Set(reasons)];
  return unique.length ? { ok: false, reasons: unique.slice(0, limit) } : { ok: true };
}
