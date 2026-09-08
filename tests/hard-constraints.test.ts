import { describe, it, expect } from "vitest";
import { solve, buildWindows } from "@/lib/scheduler/engine";
import { roomSatisfies, eligibleRoomsFor } from "@/lib/scheduler/rooms";
import { spanIsContiguous } from "@/lib/scheduler/time";
import { auditTimetable } from "@/lib/scheduler/audit";
import type { Session, SolverInput, DatedSession } from "@/lib/scheduler/types";
import {
  SLOTS, SLOTS_WITH_BREAK, SLOTS_WITH_GAP, ROOMS, SECTIONS, FACULTY, schedulingRules, assignment,
} from "./fixtures";

/** Turns an assignment into `n` pattern sessions for the solver. */
function sessionsFor(a: ReturnType<typeof assignment>, n: number): Session[] {
  return Array.from({ length: n }, (_, i) => ({
    key: `${a.id}#${i}`,
    assignmentId: a.id,
    sectionId: a.sectionId,
    subjectId: a.subjectId,
    subjectCode: a.subjectCode,
    facultyId: a.facultyId,
    kind: a.kind,
    duration: a.duration,
    occurrence: i,
    roomSelection: a.roomSelection,
    fixedRoom: a.fixedRoom,
    allowedRooms: a.allowedRooms,
    requiredRoomType: a.requiredRoomType,
    requiredCapabilities: a.requiredCapabilities,
  }));
}

function input(sessions: Session[], over: Partial<SolverInput> = {}): SolverInput {
  return {
    days: [1, 2, 3, 4, 5],
    slots: SLOTS,
    rooms: ROOMS,
    faculty: FACULTY,
    sections: SECTIONS,
    sessions,
    schedulingRules: schedulingRules,
    seed: 7,
    ...over,
  };
}

/** Every (day, period) a placement occupies. */
function cells(p: { day: number; slotOrder: number; duration: number }) {
  return Array.from({ length: p.duration }, (_, i) => `${p.day}:${p.slotOrder + i}`);
}

describe("room compatibility (hard)", () => {
  const section = SECTIONS[0]; // 58 students

  it("rejects a room that cannot seat the section", () => {
    const small = ROOMS.find((r) => r.id === "r-a103")!; // 40 seats
    const v = roomSatisfies(small, assignment(), "LECTURE", section.strength);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/seats 40/i);
  });

  it("rejects the wrong room type", () => {
    const lab = ROOMS.find((r) => r.id === "r-b301")!;
    const v = roomSatisfies(lab, assignment({ kind: "LECTURE" }), "LECTURE", section.strength);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/lab rooms are reserved/i);
  });

  it("requires a lab room for a lab", () => {
    const hall = ROOMS.find((r) => r.id === "r-a101")!;
    const v = roomSatisfies(hall, assignment({ kind: "LAB" }), "LAB", section.strength);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/labs need a lab room/i);
  });

  it("rejects a room missing a required capability", () => {
    const byodLab = ROOMS.find((r) => r.id === "r-b302")!; // has BYOD
    const plainLab = ROOMS.find((r) => r.id === "r-b301")!; // no BYOD
    const a = assignment({ kind: "LAB", requiredCapabilities: ["BYOD"] });

    expect(roomSatisfies(byodLab, a, "LAB", section.strength).ok).toBe(true);
    const v = roomSatisfies(plainLab, a, "LAB", section.strength);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/missing byod/i);
  });

  it("matches capabilities case-insensitively and ignores order", () => {
    const a = assignment({ kind: "LAB", requiredCapabilities: ["projector", "computer"] });
    expect(roomSatisfies(ROOMS.find((r) => r.id === "r-b301")!, a, "LAB", section.strength).ok).toBe(true);
  });

  it("honours a FIXED room and refuses every other room", () => {
    const a = assignment({ roomSelection: "FIXED", fixedRoom: "r-a101" });
    expect(roomSatisfies(ROOMS[0], a, "LECTURE", section.strength).ok).toBe(true);
    const v = roomSatisfies(ROOMS[1], a, "LECTURE", section.strength);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/pinned to a different room/i);
  });

  it("still applies capacity to a pinned room", () => {
    const a = assignment({ roomSelection: "FIXED", fixedRoom: "r-a103" }); // 40 seats
    expect(roomSatisfies(ROOMS.find((r) => r.id === "r-a103")!, a, "LECTURE", 58).ok).toBe(false);
  });

  it("restricts ALLOWED_ROOMS to the listed set", () => {
    const a = assignment({ kind: "LAB", roomSelection: "ALLOWED_ROOMS", allowedRooms: ["r-b302"] });
    expect(roomSatisfies(ROOMS.find((r) => r.id === "r-b302")!, a, "LAB", section.strength).ok).toBe(true);
    const v = roomSatisfies(ROOMS.find((r) => r.id === "r-b301")!, a, "LAB", section.strength);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/not in this session's list/i);
  });

  it("narrows the eligible set to exactly the permitted rooms", () => {
    const a = assignment({ kind: "LAB", roomSelection: "ALLOWED_ROOMS", allowedRooms: ["r-b301", "r-b302"] });
    const fits = eligibleRoomsFor(ROOMS, a, "LAB", 58);
    expect(fits.map((r) => r.id).sort()).toEqual(["r-b301", "r-b302"]);
  });
});

describe("multi-period contiguity (hard)", () => {
  it("never lets a session cross an explicit break slot", () => {
    const windows = buildWindows(SLOTS_WITH_BREAK, false);
    const three = windows.get(3)!;
    // A window starting at P3 (order 2) would need orders 2,3,4 — order 4 is the break.
    expect(three.some((w) => w.includes(4))).toBe(false);
  });

  it("allows crossing a break only when the rule permits it", () => {
    const permissive = buildWindows(SLOTS_WITH_BREAK, true);
    expect(permissive.get(3)!.some((w) => w.includes(4))).toBe(true);
  });

  it("never lets a session cross a real clock gap, even with no break slot", () => {
    // P4 ends 12:20, P5 starts 12:45 — 25 idle minutes.
    const windows = buildWindows(SLOTS_WITH_GAP, true);
    expect(windows.get(2)!.some((w) => w[0] === 3 && w[1] === 4)).toBe(false);
    const v = spanIsContiguous(SLOTS_WITH_GAP, 3, 2, true);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/break between/i);
  });

  it("refuses a span that runs off the end of the day", () => {
    const v = spanIsContiguous(SLOTS, 8, 2, false);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/past the end of the day/i);
  });

  it("places a 3-period lab in three contiguous periods", () => {
    const a = assignment({ kind: "LAB", duration: 3, requiredRoomType: "LAB" });
    const res = solve(input(sessionsFor(a, 1)));
    const p = Object.values(res.placements)[0];
    expect(p).toBeDefined();
    expect(p.duration).toBe(3);
    const room = ROOMS.find((r) => r.id === p.roomId)!;
    expect(room.type).toBe("LAB");
  });
});

describe("clash prevention (hard)", () => {
  it("never double-books a section", () => {
    const a = assignment({ requiredSessions: 5 });
    const b = assignment({ requiredSessions: 5, facultyId: "f-2", sectionId: "s-2403", sectionNumber: "2403" });
    const res = solve(input([...sessionsFor(a, 5), ...sessionsFor(b, 5)]));
    const seen = new Set<string>();
    for (const p of Object.values(res.placements)) {
      for (const c of cells(p)) {
        expect(seen.has(c)).toBe(false); // same section, so any overlap is a clash
        seen.add(c);
      }
    }
  });

  it("never double-books a faculty member across two sections", () => {
    const a = assignment({ sectionId: "s-2403", sectionNumber: "2403" });
    const b = assignment({ sectionId: "s-2404", sectionNumber: "2404" });
    const res = solve(input([...sessionsFor(a, 4), ...sessionsFor(b, 4)]));
    const seen = new Set<string>();
    for (const p of Object.values(res.placements)) {
      for (const c of cells(p)) {
        expect(seen.has(c)).toBe(false); // both are faculty f-1
        seen.add(c);
      }
    }
  });

  it("never puts two sessions in one room at one time", () => {
    const a = assignment({ sectionId: "s-2403", sectionNumber: "2403" });
    const b = assignment({ sectionId: "s-2404", sectionNumber: "2404", facultyId: "f-2" });
    const res = solve(input([...sessionsFor(a, 6), ...sessionsFor(b, 6)]));
    const byRoom = new Map<string, Set<string>>();
    for (const p of Object.values(res.placements)) {
      const set = byRoom.get(p.roomId) ?? new Set<string>();
      for (const c of cells(p)) {
        expect(set.has(c)).toBe(false);
        set.add(c);
      }
      byRoom.set(p.roomId, set);
    }
  });

  it("respects a pinned cell it was handed as immovable", () => {
    const a = assignment();
    const res = solve(input(sessionsFor(a, 4), {
      locked: [{
        sessionKey: "pin", day: 1, slotOrder: 0, duration: 1,
        roomId: "r-a101", sectionId: "s-2403", facultyId: "f-1",
      }],
    }));
    for (const p of Object.values(res.placements)) {
      expect(cells(p)).not.toContain("1:0");
    }
  });

  it("respects declared faculty unavailability", () => {
    const busy = FACULTY.map((f) =>
      f.id === "f-1"
        ? { ...f, unavailability: [0, 1, 2, 3].map((o) => ({ day: 1, slotOrder: o })) }
        : f
    );
    const a = assignment();
    const res = solve(input(sessionsFor(a, 3), { faculty: busy }));
    for (const p of Object.values(res.placements)) {
      if (p.day === 1) expect(p.slotOrder).toBeGreaterThan(3);
    }
  });
});

describe("same assignment per day (hard, default 1)", () => {
  it("spreads five weekly cells across five days", () => {
    const a = assignment();
    const res = solve(input(sessionsFor(a, 5)));
    const days = Object.values(res.placements).map((p) => p.day);
    expect(new Set(days).size).toBe(days.length);
  });

  it("cannot place more cells than there are days at a cap of one", () => {
    const a = assignment();
    // Six cells, five teaching days, one per day: the sixth has nowhere to go.
    const res = solve(input(sessionsFor(a, 6)));
    expect(Object.keys(res.placements).length).toBe(5);
    expect(res.unplaced.length).toBe(1);
  });

  it("allows two a day when the rule is raised", () => {
    const a = assignment();
    const res = solve(input(sessionsFor(a, 6), {
      schedulingRules: { ...schedulingRules, maxSessionsPerAssignmentPerDay: 2 },
    }));
    expect(Object.keys(res.placements).length).toBe(6);
  });
});

describe("infeasibility is reported, never hidden", () => {
  it("explains a lab with no room large enough", () => {
    const tinyLabsOnly = ROOMS.filter((r) => r.type !== "LAB").concat({
      id: "r-tiny", code: "999", block: "Z", capacity: 20, type: "LAB", capabilities: [],
    });
    const a = assignment({ kind: "LAB", duration: 2, requiredRoomType: "LAB" });
    const res = solve(input(sessionsFor(a, 1), { rooms: tinyLabsOnly }));
    expect(Object.keys(res.placements)).toHaveLength(0);
    expect(res.unplaced[0].reason).toMatch(/seats 58|no .*room/i);
  });

  it("explains an impossible capability requirement", () => {
    const a = assignment({ kind: "LAB", requiredCapabilities: ["HOLODECK"] });
    const res = solve(input(sessionsFor(a, 1)));
    expect(res.unplaced).toHaveLength(1);
  });

  it("explains an empty ALLOWED_ROOMS list rather than falling back to AUTO", () => {
    const a = assignment({ roomSelection: "ALLOWED_ROOMS", allowedRooms: [] });
    const res = solve(input(sessionsFor(a, 1)));
    expect(Object.keys(res.placements)).toHaveLength(0);
  });
});

describe("determinism", () => {
  it("reproduces the same timetable for the same seed", () => {
    const a = assignment({ sectionId: "s-2403", sectionNumber: "2403" });
    const b = assignment({ sectionId: "s-2404", sectionNumber: "2404", facultyId: "f-2" });
    const sessions = [...sessionsFor(a, 4), ...sessionsFor(b, 4)];
    const one = solve(input(sessions, { seed: 99 }));
    const two = solve(input(sessions, { seed: 99 }));
    expect(two.placements).toEqual(one.placements);
  });
});

describe("the validator catches what a broken scheduler would emit", () => {
  const base = {
    assignments: [] as any[],
    teachingDays: [{ date: "2025-07-21", weekday: 1, patternWeekday: 1, week: 1 }],
    slots: SLOTS,
    rooms: ROOMS,
    sections: SECTIONS,
    faculty: FACULTY,
    schedulingRules: schedulingRules,
  };

  const session = (over: Partial<DatedSession> = {}): DatedSession => ({
    assignmentId: "a-x",
    date: "2025-07-21", day: 1, slotOrder: 0, duration: 1,
    sectionId: "s-2403", subjectId: "sub", facultyId: "f-1", roomId: "r-a101",
    kind: "LECTURE", type: "REGULAR", locked: false,
    ...over,
  });

  const a = assignment({ id: "a-x", requiredSessions: 1 });

  it("flags a hand-crafted room clash", () => {
    const report = auditTimetable({
      ...base,
      assignments: [a, assignment({ id: "a-y", requiredSessions: 1, sectionId: "s-2404", sectionNumber: "2404", facultyId: "f-2" })],
      sessions: [
        session(),
        session({ assignmentId: "a-y", sectionId: "s-2404", facultyId: "f-2", roomId: "r-a101" }),
      ],
    });
    expect(report.hardViolations.some((v) => v.rule === "ROOM_CLASH")).toBe(true);
    expect(report.publishable).toBe(false);
  });

  it("flags a section clash", () => {
    const report = auditTimetable({
      ...base,
      assignments: [a, assignment({ id: "a-y", requiredSessions: 1, facultyId: "f-2" })],
      sessions: [session(), session({ assignmentId: "a-y", facultyId: "f-2", roomId: "r-a102" })],
    });
    expect(report.hardViolations.some((v) => v.rule === "SECTION_CLASH")).toBe(true);
  });

  it("flags a faculty clash", () => {
    const report = auditTimetable({
      ...base,
      assignments: [a, assignment({ id: "a-y", requiredSessions: 1, sectionId: "s-2404", sectionNumber: "2404" })],
      sessions: [session(), session({ assignmentId: "a-y", sectionId: "s-2404", roomId: "r-a102" })],
    });
    expect(report.hardViolations.some((v) => v.rule === "FACULTY_CLASH")).toBe(true);
  });

  it("flags a room that is too small", () => {
    const report = auditTimetable({
      ...base, assignments: [a],
      sessions: [session({ roomId: "r-a103" })], // 40 seats, 58 students
    });
    expect(report.hardViolations.some((v) => v.rule === "CAPACITY")).toBe(true);
  });

  it("flags a lab held in a lecture room", () => {
    const lab = assignment({ id: "a-x", kind: "LAB", requiredSessions: 1, requiredRoomType: "LAB" });
    const report = auditTimetable({
      ...base, assignments: [lab],
      sessions: [session({ kind: "LAB", roomId: "r-a101" })],
    });
    expect(report.hardViolations.some((v) => v.rule === "ROOM_COMPATIBILITY")).toBe(true);
  });

  it("flags a violated fixed-room restriction", () => {
    const pinned = assignment({ id: "a-x", requiredSessions: 1, roomSelection: "FIXED", fixedRoom: "r-a101" });
    const report = auditTimetable({
      ...base, assignments: [pinned],
      sessions: [session({ roomId: "r-a102" })],
    });
    expect(report.hardViolations.some((v) => v.rule === "ROOM_RESTRICTION")).toBe(true);
  });

  it("flags a class on a non-teaching date", () => {
    const report = auditTimetable({
      ...base, assignments: [a],
      sessions: [session({ date: "2025-07-26" })], // a Saturday, not on the calendar
    });
    expect(report.hardViolations.some((v) => v.rule === "CALENDAR")).toBe(true);
  });

  it("allows an extra class off-calendar, since that is the point of one", () => {
    const report = auditTimetable({
      ...base, assignments: [a],
      sessions: [session(), session({ assignmentId: undefined, type: "EXTRA", date: "2025-07-26", slotOrder: 5, roomId: "r-a102" })],
    });
    expect(report.hardViolations.filter((v) => v.rule === "CALENDAR")).toHaveLength(0);
  });

  it("flags a session that overlaps a break it may not cross", () => {
    const report = auditTimetable({
      ...base, slots: SLOTS_WITH_BREAK, assignments: [{ ...a, duration: 2 }],
      sessions: [session({ slotOrder: 3, duration: 2 })], // orders 3,4 — 4 is lunch
    });
    expect(report.hardViolations.some((v) => v.rule === "CONTIGUITY")).toBe(true);
  });

  it("flags the same assignment twice in one day", () => {
    const report = auditTimetable({
      ...base, assignments: [{ ...a, requiredSessions: 2 }],
      sessions: [session(), session({ slotOrder: 5, roomId: "r-a102" })],
    });
    expect(report.hardViolations.some((v) => v.rule === "ASSIGNMENT_PER_DAY")).toBe(true);
  });

  it("flags a session count that misses the requirement", () => {
    const report = auditTimetable({
      ...base, assignments: [{ ...a, requiredSessions: 40 }],
      sessions: [session()],
    });
    expect(report.countMismatches).toEqual([
      { assignment: "SUB101 · §2403".replace("SUB101", a.subjectCode), required: 40, scheduled: 1 },
    ]);
    expect(report.publishable).toBe(false);
  });

  it("passes a clean single-session timetable", () => {
    const report = auditTimetable({ ...base, assignments: [a], sessions: [session()] });
    expect(report.hardViolations).toHaveLength(0);
    expect(report.countMismatches).toHaveLength(0);
    expect(report.publishable).toBe(true);
  });
});
