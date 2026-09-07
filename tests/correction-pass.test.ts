import { describe, expect, it } from "vitest";
import { regularSessionSchema, timeSlotSchema } from "@/lib/validators";
import { spanIsContiguous } from "@/lib/scheduler/time";

describe("final correction pass", () => {
  it("accepts regular-session repair payloads without allowing ad-hoc fields", () => {
    const result = regularSessionSchema.parse({
      type: "REGULAR",
      assignment: "507f1f77bcf86cd799439011",
      room: "507f1f77bcf86cd799439012",
      date: "2026-09-07",
      slotOrder: "2",
    });
    expect(result.slotOrder).toBe(2);
    expect(result.assignment).toBe("507f1f77bcf86cd799439011");
  });

  it("rejects invalid single periods and overlapping clock spans", () => {
    expect(() => timeSlotSchema.parse({
      label: "Bad", start: "10:00", end: "09:00", order: 1, kind: "CLASS", active: true,
    })).toThrow(/after start/);

    const slots = [
      { label: "Period 1", start: "09:00", end: "10:00", order: 1, kind: "CLASS" as const },
      { label: "Period 2", start: "09:50", end: "11:00", order: 2, kind: "CLASS" as const },
    ];
    expect(spanIsContiguous(slots, 1, 2, false).ok).toBe(false);
  });

  it("requires contiguous multi-period sessions", () => {
    const slots = [
      { label: "P1", start: "09:00", end: "09:50", order: 1, kind: "CLASS" as const },
      { label: "Break", start: "09:50", end: "10:10", order: 2, kind: "BREAK" as const },
      { label: "P2", start: "10:10", end: "11:00", order: 3, kind: "CLASS" as const },
    ];
    expect(spanIsContiguous(slots, 1, 3, false).ok).toBe(false);
  });
});
