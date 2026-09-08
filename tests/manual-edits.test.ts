import { describe, it, expect } from "vitest";
import { validateMove, validatePattern } from "@/lib/scheduler/moves";
import { buildTeachingDays } from "@/lib/scheduler/calendar";
import type { DatedSession } from "@/lib/scheduler/types";
import { SLOTS, SLOTS_WITH_BREAK, ROOMS, SECTIONS, FACULTY, schedulingRules, SEMESTER, assignment } from "./fixtures";

const DAYS = buildTeachingDays(SEMESTER);
const MONDAY = "2025-07-21";

const A = assignment({ id: "a-1", requiredSessions: 40 });
const B = assignment({ id: "a-2", requiredSessions: 40, facultyId: "f-2" });
const LAB = assignment({
  id: "a-lab", requiredSessions: 13, kind: "LAB", duration: 3,
  requiredRoomType: "LAB", requiredCapabilities: ["BYOD"], facultyId: "f-2",
});

function ctx(sessions: (DatedSession & { id: string })[]) {
  return {
    sessions,
    assignments: [A, B, LAB],
    teachingDays: DAYS,
    slots: SLOTS,
    rooms: ROOMS,
    sections: SECTIONS,
    faculty: FACULTY,
    schedulingRules: schedulingRules,
  };
}

function placed(over: Partial<DatedSession & { id: string }> = {}): DatedSession & { id: string } {
  return {
    id: "sess-1",
    assignmentId: "a-1",
    date: MONDAY, day: 1, slotOrder: 0, duration: 1,
    sectionId: "s-2403", subjectId: "sub-1", facultyId: "f-1", roomId: "r-a101",
    kind: "LECTURE", type: "REGULAR", locked: false,
    ...over,
  };
}

const move = (over: Record<string, unknown> = {}) => ({
  sessionId: "sess-1",
  date: MONDAY,
  slotOrder: 2,
  duration: 1,
  sectionId: "s-2403",
  facultyId: "f-1",
  roomId: "r-a101",
  kind: "LECTURE" as const,
  type: "REGULAR" as const,
  assignmentId: "a-1",
  ...over,
});

describe("manual edits cannot bypass hard constraints", () => {
  it("accepts a clean move", () => {
    expect(validateMove(move(), ctx([placed()])).ok).toBe(true);
  });

  it("rejects a move onto a period where the section is already busy", () => {
    const v = validateMove(move({ slotOrder: 4 }), ctx([
      placed(),
      placed({ id: "other", assignmentId: "a-2", facultyId: "f-2", slotOrder: 4, roomId: "r-a102" }),
    ]));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reasons.join(" ")).toMatch(/section already has a class/i);
  });

  it("rejects a move that double-books the faculty member", () => {
    const v = validateMove(move({ slotOrder: 4 }), ctx([
      placed(),
      placed({ id: "other", assignmentId: "a-1", sectionId: "s-2404", slotOrder: 4, roomId: "r-a102" }),
    ]));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reasons.join(" ")).toMatch(/already teaching/i);
  });

  it("rejects a move into an occupied room", () => {
    const v = validateMove(move({ slotOrder: 4, roomId: "r-a102" }), ctx([
      placed(),
      placed({ id: "other", assignmentId: "a-2", sectionId: "s-2404", facultyId: "f-2", slotOrder: 4, roomId: "r-a102" }),
    ]));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reasons.join(" ")).toMatch(/already occupied/i);
  });

  it("rejects a room that is too small", () => {
    const v = validateMove(move({ roomId: "r-a103" }), ctx([placed()]));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reasons.join(" ")).toMatch(/seats 40/i);
  });

  it("rejects a move onto a date the calendar blocks", () => {
    const v = validateMove(move({ date: "2025-07-26" }), ctx([placed()])); // Saturday
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reasons.join(" ")).toMatch(/not a teaching day/i);
  });

  it("rejects a lab moved into a room without the required capability", () => {
    const v = validateMove(
      move({ assignmentId: "a-lab", kind: "LAB", duration: 3, facultyId: "f-2", roomId: "r-b301" }),
      ctx([placed({ id: "sess-1", assignmentId: "a-lab", kind: "LAB", duration: 3, facultyId: "f-2", roomId: "r-b302" })])
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reasons.join(" ")).toMatch(/missing byod/i);
  });

  it("rejects a multi-period session that would cross a break", () => {
    const v = validateMove(
      move({ assignmentId: "a-lab", kind: "LAB", duration: 3, facultyId: "f-2", roomId: "r-b302", slotOrder: 3 }),
      { ...ctx([placed({ id: "sess-1", assignmentId: "a-lab" })]), slots: SLOTS_WITH_BREAK }
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reasons.join(" ")).toMatch(/lunch/i);
  });

  it("rejects a second occurrence of the same class on one date", () => {
    const v = validateMove(move({ sessionId: "new", slotOrder: 6 }), ctx([
      placed({ id: "existing", slotOrder: 0 }),
    ]));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reasons.join(" ")).toMatch(/already meets once/i);
  });

  it("rejects a move that breaches the section's daily cap", () => {
    const seven = Array.from({ length: 7 }, (_, i) =>
      placed({ id: `s${i}`, assignmentId: "a-2", facultyId: "f-2", slotOrder: i, roomId: "r-a102" })
    );
    const v = validateMove(move({ sessionId: "new", slotOrder: 8 }), ctx(seven));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reasons.join(" ")).toMatch(/periods that day/i);
  });

  it("rejects a move into a period the faculty member is unavailable for", () => {
    const busy = FACULTY.map((f) =>
      f.id === "f-1" ? { ...f, unavailability: [{ day: 1, slotOrder: 2 }] } : f
    );
    const v = validateMove(move({ slotOrder: 2 }), { ...ctx([placed()]), faculty: busy });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reasons.join(" ")).toMatch(/unavailable/i);
  });

  it("reports every problem at once, not just the first", () => {
    const v = validateMove(move({ slotOrder: 4, roomId: "r-a103" }), ctx([
      placed(),
      placed({ id: "other", assignmentId: "a-2", facultyId: "f-2", slotOrder: 4, roomId: "r-a103" }),
    ]));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reasons.length).toBeGreaterThan(1);
  });

  it("lets an extra class sit on a non-teaching date, since that is its purpose", () => {
    const v = validateMove(
      move({ sessionId: undefined, type: "EXTRA", assignmentId: undefined, date: "2025-07-26", slotOrder: 6 }),
      ctx([placed()])
    );
    expect(v.ok).toBe(true);
  });
});

describe("whole-pattern validation", () => {
  const patternCtx = {
    assignments: [A, B, LAB],
    slots: SLOTS,
    rooms: ROOMS,
    sections: SECTIONS,
    faculty: FACULTY,
    schedulingRules: schedulingRules,
    days: [1, 2, 3, 4, 5],
  };

  it("accepts a clean pattern", () => {
    const v = validatePattern([
      { assignmentId: "a-1", day: 1, slotOrder: 0, duration: 1, roomId: "r-a101" },
      { assignmentId: "a-2", day: 1, slotOrder: 1, duration: 1, roomId: "r-a101" },
    ], patternCtx);
    expect(v.ok).toBe(true);
  });

  it("catches a section double-booked inside a submitted layout", () => {
    const v = validatePattern([
      { assignmentId: "a-1", day: 1, slotOrder: 0, duration: 1, roomId: "r-a101" },
      { assignmentId: "a-2", day: 1, slotOrder: 0, duration: 1, roomId: "r-a102" },
    ], patternCtx);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reasons.join(" ")).toMatch(/double-booked/i);
  });

  it("catches a room double-booked inside a submitted layout", () => {
    const v = validatePattern([
      { assignmentId: "a-1", day: 2, slotOrder: 0, duration: 1, roomId: "r-a101" },
      { assignmentId: "a-2", day: 2, slotOrder: 0, duration: 1, roomId: "r-a101" },
    ], patternCtx);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reasons.join(" ")).toMatch(/room a-101 is double-booked/i);
  });

  it("catches a duration that contradicts the assignment", () => {
    const v = validatePattern([
      { assignmentId: "a-1", day: 1, slotOrder: 0, duration: 3, roomId: "r-a101" },
    ], patternCtx);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reasons.join(" ")).toMatch(/but the assignment specifies 1/i);
  });

  it("catches an incompatible room in a submitted layout", () => {
    const v = validatePattern([
      { assignmentId: "a-lab", day: 1, slotOrder: 0, duration: 3, roomId: "r-b301" }, // no BYOD
    ], patternCtx);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reasons.join(" ")).toMatch(/missing byod/i);
  });

  it("catches the same class placed twice on one weekday", () => {
    const v = validatePattern([
      { assignmentId: "a-1", day: 1, slotOrder: 0, duration: 1, roomId: "r-a101" },
      { assignmentId: "a-1", day: 1, slotOrder: 6, duration: 1, roomId: "r-a101" },
    ], patternCtx);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reasons.join(" ")).toMatch(/appears 2 times on one day/i);
  });

  it("catches a placement on a non-teaching weekday", () => {
    const v = validatePattern([
      { assignmentId: "a-1", day: 6, slotOrder: 0, duration: 1, roomId: "r-a101" },
    ], patternCtx);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reasons.join(" ")).toMatch(/not a teaching weekday/i);
  });
});
