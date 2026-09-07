/**
 * Pure, dependency-free constraint checking shared by the browser and the server.
 *
 * The Studio calls this on every drag to paint which cells can accept the
 * session in hand, and the server calls the same functions before persisting a
 * manual edit — so the UI can never talk the API into an invalid state. It must
 * stay free of Mongoose so it can ship to the client.
 */

import { roomSatisfies } from "./rooms";
import { spanIsContiguous, spanOf, slotsInWindow } from "./time";
import type { RoomRequirement, RoomType, SessionKind } from "./types";

export interface LiteSlot { order: number; kind: "CLASS" | "BREAK"; start: string; end: string; label: string }
export interface LiteRoom {
  _id: string; code: string; block: string; capacity: number; type: string;
  capabilities?: string[];
}
export interface LiteEntry {
  _id: string;
  day: number;
  slotOrder: number;
  duration: number;
  kind: string;
  locked?: boolean;
  section: { _id: string; number: string; strength?: number };
  subject: { _id: string; code: string; name: string };
  faculty: { _id: string; name: string; facultyId?: string };
  room: { _id: string; code: string; block: string; capacity?: number; type?: string; capabilities?: string[] };
}

/** A session being placed — either an existing entry or one from the palette. */
export interface Candidate {
  entryId?: string;
  assignmentId?: string;
  duration: number;
  kind: string;
  sectionId: string;
  sectionStrength: number;
  facultyId: string;
  roomId?: string;
  roomSelection?: "AUTO" | "FIXED" | "ALLOWED_ROOMS";
  requiredRoomType?: string;
  fixedRoomId?: string;
  allowedRoomIds?: string[];
  requiredCapabilities?: string[];
  /** Blocked (day, slotOrder) pairs for the faculty member. */
  facultyUnavailability?: { day: number; slotOrder: number }[];
}

export interface Rules {
  workingDays: number[];
  maxHoursPerDayPerSection: number;
  maxConsecutiveHoursPerFaculty: number;
  allowSessionsAcrossBreak: boolean;
  maxSessionsPerAssignmentPerDay?: number;
}

export type Verdict = { ok: true } | { ok: false; reason: string };

const key = (d: number, o: number) => `${d}:${o}`;

/** Adapts the UI's flat candidate shape to the shared room requirement type. */
function requirementOf(c: Candidate): RoomRequirement {
  return {
    roomSelection: c.roomSelection ?? (c.fixedRoomId ? "FIXED" : "AUTO"),
    fixedRoom: c.fixedRoomId,
    allowedRooms: c.allowedRoomIds ?? [],
    requiredRoomType: c.requiredRoomType as RoomType | undefined,
    requiredCapabilities: c.requiredCapabilities ?? [],
  };
}

/**
 * The room rules for a placed entry, read off its assignment.
 *
 * Without this the inspector would happily offer a room that a FIXED or
 * ALLOWED_ROOMS assignment may not use, and the admin would only find out when
 * the whole layout save was rejected.
 */
export function requirementFromAssignment(a: any): Partial<Candidate> {
  if (!a) return {};
  return {
    roomSelection: a.roomSelection ?? "AUTO",
    requiredRoomType: a.requiredRoomType,
    fixedRoomId: a.fixedRoom ? String(a.fixedRoom._id ?? a.fixedRoom) : undefined,
    allowedRoomIds: (a.allowedRooms ?? []).map((r: any) => String(r._id ?? r)),
    requiredCapabilities: a.requiredCapabilities ?? [],
  };
}

function toRoomRef(room: LiteRoom) {
  return {
    id: room._id,
    code: room.code,
    block: room.block,
    capacity: room.capacity,
    type: (room.type ?? "CLASSROOM") as RoomType,
    capabilities: room.capabilities ?? [],
  };
}

/** O(1) lookups for "is this section/faculty/room busy at day:slot?" */
export class Occupancy {
  private section = new Map<string, LiteEntry>();
  private faculty = new Map<string, LiteEntry>();
  private room = new Map<string, LiteEntry>();
  private sectionDay = new Map<string, number>();
  private assignmentDay = new Map<string, number>();

  constructor(entries: LiteEntry[], private ignoreId?: string) {
    for (const e of entries) {
      if (this.ignoreId && e._id === this.ignoreId) continue;
      for (const o of spanOf(e.slotOrder, e.duration)) {
        const k = key(e.day, o);
        this.section.set(`${e.section._id}|${k}`, e);
        this.faculty.set(`${e.faculty._id}|${k}`, e);
        this.room.set(`${e.room._id}|${k}`, e);
      }
      const dk = `${e.section._id}:${e.day}`;
      this.sectionDay.set(dk, (this.sectionDay.get(dk) ?? 0) + e.duration);
      const aid = (e as any).assignment;
      if (aid) {
        const ak = `${String(aid)}:${e.day}`;
        this.assignmentDay.set(ak, (this.assignmentDay.get(ak) ?? 0) + 1);
      }
    }
  }

  sectionAt(id: string, d: number, o: number) { return this.section.get(`${id}|${key(d, o)}`); }
  facultyAt(id: string, d: number, o: number) { return this.faculty.get(`${id}|${key(d, o)}`); }
  roomAt(id: string, d: number, o: number) { return this.room.get(`${id}|${key(d, o)}`); }
  sectionLoad(id: string, d: number) { return this.sectionDay.get(`${id}:${d}`) ?? 0; }
  assignmentOnDay(id: string, d: number) { return this.assignmentDay.get(`${id}:${d}`) ?? 0; }
}

export function roomAccepts(room: LiteRoom, c: Candidate): Verdict {
  return roomSatisfies(
    toRoomRef(room), requirementOf(c), (c.kind as SessionKind) ?? "LECTURE", c.sectionStrength
  );
}

/**
 * Can `c` start at (day, slotOrder)? Returns the first blocking reason, phrased
 * for the person reading it rather than for a log file.
 */
export function checkPlacement(
  c: Candidate,
  day: number,
  slotOrder: number,
  slots: LiteSlot[],
  occ: Occupancy,
  rules: Rules,
  room?: LiteRoom
): Verdict {
  if (!rules.workingDays.includes(day))
    return { ok: false, reason: "Not a working day." };

  // Duration, contiguity and break-crossing in one shared check.
  const span = spanIsContiguous(slots, slotOrder, c.duration, rules.allowSessionsAcrossBreak);
  if (!span.ok) return span;

  if (room) {
    const fit = roomAccepts(room, c);
    if (!fit.ok) return fit;
  }

  const orders = spanOf(slotOrder, c.duration);

  if (c.facultyUnavailability?.length) {
    const blocked = new Set(c.facultyUnavailability.map((u) => key(u.day, u.slotOrder)));
    if (orders.some((o) => blocked.has(key(day, o))))
      return { ok: false, reason: "That faculty member is marked unavailable then." };
  }

  for (const o of orders) {
    const s = occ.sectionAt(c.sectionId, day, o);
    if (s) return { ok: false, reason: `Section is in ${s.subject.code} then.` };

    const f = occ.facultyAt(c.facultyId, day, o);
    if (f) return { ok: false, reason: `${f.faculty.name.split(" ")[0]} is teaching ${f.subject.code} then.` };

    if (c.roomId) {
      const r = occ.roomAt(c.roomId, day, o);
      if (r) return { ok: false, reason: `Room is taken by ${r.subject.code} then.` };
    }
  }

  const load = occ.sectionLoad(c.sectionId, day);
  if (load + c.duration > rules.maxHoursPerDayPerSection)
    return { ok: false, reason: `Section already has ${load} periods that day (cap ${rules.maxHoursPerDayPerSection}).` };

  const cap = rules.maxSessionsPerAssignmentPerDay ?? 1;
  if (c.assignmentId && occ.assignmentOnDay(c.assignmentId, day) >= cap) {
    return {
      ok: false,
      reason: cap === 1
        ? "This class already meets once that day."
        : `This class already meets ${cap} times that day.`,
    };
  }

  return { ok: true };
}

/** Every startable cell for the session in hand, keyed "day:slot". */
export function dropMap(
  c: Candidate,
  slots: LiteSlot[],
  entries: LiteEntry[],
  rules: Rules,
  room?: LiteRoom
): Map<string, Verdict> {
  const occ = new Occupancy(entries, c.entryId);
  const out = new Map<string, Verdict>();
  for (const day of rules.workingDays) {
    for (const s of slots) {
      if (s.kind === "BREAK") continue;
      out.set(key(day, s.order), checkPlacement(c, day, s.order, slots, occ, rules, room));
    }
  }
  return out;
}

/**
 * Rooms that could host this session, ranked in three tiers:
 *
 *   0. free now — the tightest adequate room first, so big halls stay free
 *   1. suitable but occupied — could work if something else moves
 *   2. structurally unsuitable — too small, or the wrong type, always
 *
 * The distinction matters in the inspector: "busy right now" is a problem the
 * admin can solve by rearranging, "seats 30 for a section of 50" never is.
 */
export function availableRooms(
  c: Candidate,
  day: number,
  slotOrder: number,
  rooms: LiteRoom[],
  entries: LiteEntry[]
): { room: LiteRoom; free: boolean; tier: 0 | 1 | 2; reason?: string }[] {
  const occ = new Occupancy(entries, c.entryId);
  return rooms
    .map((room) => {
      const fit = roomAccepts(room, c);
      if (!fit.ok) return { room, free: false, tier: 2 as const, reason: fit.reason };
      for (const o of spanOf(slotOrder, c.duration)) {
        const taken = occ.roomAt(room._id, day, o);
        if (taken) {
          return { room, free: false, tier: 1 as const, reason: `Taken by ${taken.subject.code}` };
        }
      }
      return { room, free: true, tier: 0 as const };
    })
    .sort((a, b) => a.tier - b.tier || a.room.capacity - b.room.capacity);
}

export { slotsInWindow };
