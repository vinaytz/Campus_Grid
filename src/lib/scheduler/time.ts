/** Clock helpers shared by the solver, the optimiser and the validator. */

import type { SlotRef } from "./types";

/** "13:45" → 825. Returns NaN for anything unparseable. */
export function minutesOf(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? "").trim());
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Orders of the teachable slots that overlap [start, end).
 *
 * Overlap, not containment: with a window of 12:00–15:00 a 11:30–12:20 period
 * counts, because a section sitting in it does not have a free lunch hour.
 */
export function slotsInWindow(slots: SlotRef[], start: string, end: string): number[] {
  const from = minutesOf(start);
  const to = minutesOf(end);
  if (Number.isNaN(from) || Number.isNaN(to)) return [];
  return slots
    .filter((s) => s.kind === "CLASS")
    .filter((s) => {
      const a = minutesOf(s.start);
      const b = minutesOf(s.end);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      return a < to && b > from;
    })
    .map((s) => s.order);
}

/** Slot orders that make up a session starting at `slotOrder`. */
export function spanOf(slotOrder: number, duration: number): number[] {
  return Array.from({ length: duration }, (_, i) => slotOrder + i);
}

/** True when every slot in the span exists, is teachable and is clock-contiguous. */
export function spanIsContiguous(
  slots: SlotRef[],
  slotOrder: number,
  duration: number,
  allowAcrossBreak: boolean
): { ok: true } | { ok: false; reason: string } {
  const byOrder = new Map(slots.map((s) => [s.order, s]));
  let previous: SlotRef | null = null;

  for (const o of spanOf(slotOrder, duration)) {
    const slot = byOrder.get(o);
    if (!slot) {
      return { ok: false, reason: `Needs ${duration} periods and runs past the end of the day.` };
    }
    if (slot.kind === "BREAK" && !allowAcrossBreak) {
      return { ok: false, reason: `Would run through ${slot.label.toLowerCase()}.` };
    }
    if (previous && minutesOf(previous.end) !== minutesOf(slot.start)) {
      return {
        ok: false,
        reason: `There is a break between ${previous.label} and ${slot.label}, so a ${duration}-period session can't span them.`,
      };
    }
    previous = slot;
  }
  return { ok: true };
}
