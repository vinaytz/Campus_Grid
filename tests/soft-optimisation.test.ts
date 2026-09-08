import { describe, it, expect } from "vitest";
import { scoreTimetable } from "@/lib/scheduler/score";
import { buildTeachingDays } from "@/lib/scheduler/calendar";
import { slotsInWindow, minutesOf } from "@/lib/scheduler/time";
import type { DatedSession } from "@/lib/scheduler/types";
import { SLOTS, ROOMS, SECTIONS, FACULTY, schedulingRules, SEMESTER, assignment } from "./fixtures";

const DAYS = buildTeachingDays(SEMESTER);

function score(sessions: DatedSession[], assignments = [assignment({ id: "a-1", requiredSessions: sessions.length })]) {
  return scoreTimetable({
    sessions, assignments, teachingDays: DAYS, slots: SLOTS,
    sections: SECTIONS, faculty: FACULTY, rooms: ROOMS, schedulingRules: schedulingRules,
  });
}

function session(over: Partial<DatedSession> = {}): DatedSession {
  return {
    assignmentId: "a-1",
    date: "2025-07-21", day: 1, slotOrder: 0, duration: 1,
    sectionId: "s-2403", subjectId: "sub-1", facultyId: "f-1", roomId: "r-a101",
    kind: "LECTURE", type: "REGULAR", locked: false,
    ...over,
  };
}

describe("afternoon window", () => {
  it("selects the periods that overlap the configured window, not a fixed lunch hour", () => {
    const window = slotsInWindow(SLOTS, "12:00", "15:00");
    // P4 11:30-12:20 overlaps, P8 14:50-15:40 overlaps, P9 15:40-16:30 does not.
    expect(window).toEqual([3, 4, 5, 6, 7]);
  });

  it("moves with the configuration", () => {
    expect(slotsInWindow(SLOTS, "13:00", "14:00")).toEqual([5, 6]);
    expect(slotsInWindow(SLOTS, "09:00", "10:00")).toEqual([0, 1]);
  });

  it("parses clock times, and rejects nonsense", () => {
    expect(minutesOf("13:45")).toBe(825);
    expect(minutesOf("00:00")).toBe(0);
    expect(Number.isNaN(minutesOf("bogus"))).toBe(true);
  });
});

describe("soft scoring reflects timetable quality", () => {
  it("penalises a section with no free period in the afternoon window", () => {
    // Fill every window period (3–7) on one day.
    const full = [3, 4, 5, 6, 7].map((o, i) =>
      session({ assignmentId: `a-${i}`, slotOrder: o, roomId: "r-a101" })
    );
    const assignments = full.map((_, i) => assignment({ id: `a-${i}`, requiredSessions: 1 }));
    const withoutBreak = score(full, assignments);

    // The same load, but shifted so period 5 stays free.
    const spaced = [0, 1, 2, 3, 4].map((o, i) =>
      session({ assignmentId: `a-${i}`, slotOrder: o })
    );
    const withBreak = score(spaced, assignments);

    expect(withoutBreak.breakdown.afternoonBreak).toBeGreaterThan(withBreak.breakdown.afternoonBreak);
    expect(withoutBreak.warnings.some((w) => /no free period/i.test(w))).toBe(true);
  });

  it("penalises a lopsided section load more than an even one", () => {
    // Eight periods on one day.
    const lopsided = [0, 1, 2, 3, 4, 5, 6].map((o, i) =>
      session({ assignmentId: `a-${i}`, slotOrder: o })
    );
    // The same seven periods spread one per day over a week.
    const even = [0, 1, 2, 3, 4].map((_, i) =>
      session({ assignmentId: `a-${i}`, date: DAYS[i].date, day: DAYS[i].weekday, slotOrder: 0 })
    ).concat([
      session({ assignmentId: "a-5", date: DAYS[5].date, day: DAYS[5].weekday, slotOrder: 0 }),
      session({ assignmentId: "a-6", date: DAYS[6].date, day: DAYS[6].weekday, slotOrder: 0 }),
    ]);
    const assignments = Array.from({ length: 7 }, (_, i) => assignment({ id: `a-${i}`, requiredSessions: 1 }));

    expect(score(lopsided, assignments).breakdown.sectionBalance)
      .toBeGreaterThan(score(even, assignments).breakdown.sectionBalance);
  });

  it("penalises a long unbroken run and warns about it", () => {
    const run = [0, 1, 2, 3, 4, 5].map((o, i) => session({ assignmentId: `a-${i}`, slotOrder: o }));
    const assignments = run.map((_, i) => assignment({ id: `a-${i}`, requiredSessions: 1 }));
    const report = score(run, assignments);
    expect(report.breakdown.consecutive).toBeGreaterThan(0);
    expect(report.warnings.some((w) => /back-to-back/i.test(w))).toBe(true);
  });

  it("penalises idle gaps in a section's day", () => {
    const gappy = [
      session({ assignmentId: "a-0", slotOrder: 0 }),
      session({ assignmentId: "a-1", slotOrder: 8, roomId: "r-a102" }),
    ];
    const packed = [
      session({ assignmentId: "a-0", slotOrder: 0 }),
      session({ assignmentId: "a-1", slotOrder: 1, roomId: "r-a102" }),
    ];
    const assignments = [assignment({ id: "a-0", requiredSessions: 1 }), assignment({ id: "a-1", requiredSessions: 1 })];
    expect(score(gappy, assignments).breakdown.gaps).toBeGreaterThan(score(packed, assignments).breakdown.gaps);
  });

  it("penalises sessions bunched into the last weeks of term", () => {
    const tailDates = DAYS.slice(-6);
    const tail = tailDates.map((d, i) =>
      session({ assignmentId: `a-${i}`, date: d.date, day: d.weekday, slotOrder: 0 })
    );
    const spreadDates = [0, 12, 24, 36, 48, 60].map((i) => DAYS[i]);
    const spread = spreadDates.map((d, i) =>
      session({ assignmentId: `a-${i}`, date: d.date, day: d.weekday, slotOrder: 0 })
    );
    const assignments = Array.from({ length: 6 }, (_, i) => assignment({ id: `a-${i}`, requiredSessions: 1 }));

    expect(score(tail, assignments).breakdown.tailDistribution)
      .toBeGreaterThan(score(spread, assignments).breakdown.tailDistribution);
  });

  it("penalises a course stacked on adjacent days over one spread through term", () => {
    const stacked = [0, 1, 2, 3].map((i) =>
      session({ date: DAYS[i].date, day: DAYS[i].weekday, slotOrder: i })
    );
    const spread = [0, 17, 35, 52].map((i, n) =>
      session({ date: DAYS[i].date, day: DAYS[i].weekday, slotOrder: n })
    );
    const a = [assignment({ id: "a-1", requiredSessions: 4 })];
    expect(score(stacked, a).breakdown.subjectSpacing).toBeGreaterThan(score(spread, a).breakdown.subjectSpacing);
  });

  it("penalises a section parked in a room far bigger than it needs", () => {
    const tight = [session({ roomId: "r-a101" })];  // 70 seats, 58 students
    const wasteful = [session({ roomId: "r-c401" })]; // 150 seats
    expect(score(wasteful).breakdown.roomFit).toBeGreaterThan(score(tight).breakdown.roomFit);
  });

  it("reports a total that is the sum of its parts", () => {
    const report = score([session(), session({ slotOrder: 2, date: DAYS[3].date, day: DAYS[3].weekday })]);
    const sum = Object.values(report.breakdown).reduce((a, b) => a + b, 0);
    expect(report.total).toBeCloseTo(Math.round(sum * 10) / 10, 5);
  });

  it("honours a zeroed weight by removing that component entirely", () => {
    const full = [3, 4, 5, 6, 7].map((o, i) => session({ assignmentId: `a-${i}`, slotOrder: o }));
    const assignments = full.map((_, i) => assignment({ id: `a-${i}`, requiredSessions: 1 }));
    const off = scoreTimetable({
      sessions: full, assignments, teachingDays: DAYS, slots: SLOTS,
      sections: SECTIONS, faculty: FACULTY, rooms: ROOMS,
      schedulingRules: { ...schedulingRules, weights: { ...schedulingRules.weights, afternoonBreak: 0 } },
    });
    expect(off.breakdown.afternoonBreak).toBe(0);
  });

  it("says so plainly when there is nothing to score", () => {
    const report = score([], []);
    expect(report.total).toBe(0);
    expect(report.warnings[0]).toMatch(/no dated sessions/i);
  });
});
