/**
 * The single definition of "may this room host this session".
 *
 * Solver, independent validator, manual-edit checks and the Studio's drag
 * highlighting all call this. Sharing the predicate is deliberate — the
 * validator's independence comes from rebuilding *occupancy* from scratch
 * (see audit.ts), not from re-deriving compatibility a second, divergent way.
 */

import type { RoomRef, RoomRequirement, RoomType, SessionKind } from "./types";

export type RoomVerdict = { ok: true } | { ok: false; reason: string };

/** Room kinds that can host ordinary theory teaching. */
const THEORY_TYPES: RoomType[] = ["CLASSROOM", "LECTURE", "SEMINAR", "AUDITORIUM"];

/**
 * When an assignment names no explicit room type, fall back to the session kind:
 * a lab needs a LAB room, anything else needs a non-LAB room. This is the only
 * place that inference lives.
 */
export function impliedRoomTypes(kind: SessionKind): RoomType[] {
  return kind === "LAB" ? ["LAB"] : THEORY_TYPES;
}

export function missingCapabilities(room: RoomRef, required: string[]): string[] {
  if (!required?.length) return [];
  const have = new Set((room.capabilities ?? []).map((c) => c.trim().toUpperCase()));
  return required
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c.length > 0 && !have.has(c));
}

/**
 * Structural fit only — capacity, type, capabilities, and the permitted room
 * set. Says nothing about whether the room is free at a given time.
 */
export function roomSatisfies(
  room: RoomRef,
  req: RoomRequirement,
  kind: SessionKind,
  strength: number
): RoomVerdict {
  // 1. The permitted room set is absolute and checked first.
  if (req.roomSelection === "FIXED") {
    if (!req.fixedRoom) {
      return { ok: false, reason: "Pinned to a specific room, but no room was chosen." };
    }
    if (room.id !== req.fixedRoom) {
      return { ok: false, reason: "This session is pinned to a different room." };
    }
  } else if (req.roomSelection === "ALLOWED_ROOMS") {
    if (!req.allowedRooms?.length) {
      return { ok: false, reason: "Restricted to a room list, but the list is empty." };
    }
    if (!req.allowedRooms.includes(room.id)) {
      return { ok: false, reason: "Not in this session's list of permitted rooms." };
    }
  }

  // 2. Capacity. Applies to pinned rooms too — a pin can't seat 60 in a 30-seater.
  if (room.capacity < strength) {
    return { ok: false, reason: `Seats ${room.capacity}, section has ${strength} students.` };
  }

  // 3. Type.
  const wanted: RoomType[] = req.requiredRoomType
    ? [req.requiredRoomType]
    : impliedRoomTypes(kind);
  if (!wanted.includes(room.type)) {
    return {
      ok: false,
      reason: req.requiredRoomType
        ? `Needs a ${req.requiredRoomType.toLowerCase()} room, this is a ${room.type.toLowerCase()}.`
        : kind === "LAB"
        ? "Labs need a lab room."
        : "Lab rooms are reserved for labs.",
    };
  }

  // 4. Capabilities.
  const missing = missingCapabilities(room, req.requiredCapabilities ?? []);
  if (missing.length) {
    return { ok: false, reason: `Missing ${missing.join(", ").toLowerCase()}.` };
  }

  return { ok: true };
}

/**
 * Every structurally-eligible room, tightest adequate first so large halls stay
 * free for the sections that actually need them.
 */
export function eligibleRoomsFor(
  rooms: RoomRef[],
  req: RoomRequirement,
  kind: SessionKind,
  strength: number
): RoomRef[] {
  return rooms
    .filter((r) => roomSatisfies(r, req, kind, strength).ok)
    .sort((a, b) => a.capacity - b.capacity || a.id.localeCompare(b.id));
}

/** Human-readable summary of a room requirement, for diagnostics and the UI. */
export function describeRequirement(req: RoomRequirement, kind: SessionKind): string {
  const bits: string[] = [];
  if (req.roomSelection === "FIXED") bits.push("a pinned room");
  else if (req.roomSelection === "ALLOWED_ROOMS") bits.push(`one of ${req.allowedRooms.length} permitted rooms`);
  else bits.push(`a ${(req.requiredRoomType ?? impliedRoomTypes(kind)[0]).toLowerCase()} room`);
  if (req.requiredCapabilities?.length) bits.push(`with ${req.requiredCapabilities.join(" + ").toLowerCase()}`);
  return bits.join(" ");
}
