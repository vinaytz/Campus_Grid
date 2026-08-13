/**
 * Pure, dependency-free constraint checking shared by the browser and the server.
 *
 * The Studio calls this on every drag to paint which cells can accept the
 * session in hand. It must stay free of Mongoose so it can ship to the client.
 */

export interface LiteSlot { order: number; kind: "CLASS" | "BREAK"; start: string; end: string; label: string }
export interface LiteRoom { _id: string; code: string; block: string; capacity: number; type: string }
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
  room: { _id: string; code: string; block: string; capacity?: number; type?: string };
}

/** A session being placed — either an existing entry or one from the palette. */
export interface Candidate {
  entryId?: string;
  duration: number;
  kind: string;
  sectionId: string;
  sectionStrength: number;
  facultyId: string;
  roomId?: string;
  requiredRoomType?: string;
  fixedRoomId?: string;
}

export interface Rules {
  workingDays: number[];
  maxHoursPerDayPerSection: number;
  maxConsecutiveHoursPerFaculty: number;
  allowSessionsAcrossBreak: boolean;
}

export type Verdict = { ok: true } | { ok: false; reason: string };

const key = (d: number, o: number) => `${d}:${o}`;

/** O(1) lookups for "is this section/faculty/room busy at day:slot?" */
export class Occupancy {
  private section = new Map<string, LiteEntry>();
  private faculty = new Map<string, LiteEntry>();
  private room = new Map<string, LiteEntry>();
  private sectionDay = new Map<string, number>();

  constructor(entries: LiteEntry[], private ignoreId?: string) {
    for (const e of entries) {
      if (this.ignoreId && e._id === this.ignoreId) continue;
      for (let i = 0; i < e.duration; i++) {
        const k = key(e.day, e.slotOrder + i);
        this.section.set(`${e.section._id}|${k}`, e);
        this.faculty.set(`${e.faculty._id}|${k}`, e);
        this.room.set(`${e.room._id}|${k}`, e);
      }
      const dk = `${e.section._id}:${e.day}`;
      this.sectionDay.set(dk, (this.sectionDay.get(dk) ?? 0) + e.duration);
    }
  }

  sectionAt(id: string, d: number, o: number) { return this.section.get(`${id}|${key(d, o)}`); }
  facultyAt(id: string, d: number, o: number) { return this.faculty.get(`${id}|${key(d, o)}`); }
  roomAt(id: string, d: number, o: number) { return this.room.get(`${id}|${key(d, o)}`); }
  sectionLoad(id: string, d: number) { return this.sectionDay.get(`${id}:${d}`) ?? 0; }
}

export function roomAccepts(room: LiteRoom, c: Candidate): Verdict {
  if (c.fixedRoomId && room._id !== c.fixedRoomId)
    return { ok: false, reason: "This session is pinned to a different room." };
  if (room.capacity < c.sectionStrength)
    return { ok: false, reason: `Seats ${room.capacity}, section has ${c.sectionStrength} students.` };
  if (c.requiredRoomType && room.type !== c.requiredRoomType)
    return { ok: false, reason: `Needs a ${c.requiredRoomType.toLowerCase()} room.` };
  if (!c.requiredRoomType && c.kind === "LAB" && room.type !== "LAB")
    return { ok: false, reason: "Labs need a lab room." };
  if (!c.requiredRoomType && c.kind !== "LAB" && room.type === "LAB")
    return { ok: false, reason: "Lab rooms are reserved for labs." };
  return { ok: true };
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

  const byOrder = new Map(slots.map((s) => [s.order, s]));
  const span: number[] = [];
  for (let i = 0; i < c.duration; i++) span.push(slotOrder + i);

  for (const o of span) {
    const slot = byOrder.get(o);
    if (!slot)
      return { ok: false, reason: `Needs ${c.duration} periods and runs past the end of the day.` };
    if (slot.kind === "BREAK" && !rules.allowSessionsAcrossBreak)
      return { ok: false, reason: `Would run through ${slot.label.toLowerCase()}.` };
  }

  if (room) {
    const fit = roomAccepts(room, c);
    if (!fit.ok) return fit;
  }

  for (const o of span) {
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
      for (let i = 0; i < c.duration; i++) {
        const taken = occ.roomAt(room._id, day, slotOrder + i);
        if (taken) {
          return { room, free: false, tier: 1 as const, reason: `Taken by ${taken.subject.code}` };
        }
      }
      return { room, free: true, tier: 0 as const };
    })
    .sort((a, b) => a.tier - b.tier || a.room.capacity - b.room.capacity);
}
