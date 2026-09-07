import { describe, it, expect } from "vitest";
import {
  buildTeachingDays, teachingWeekCount, weekdayOccurrences,
  addDays, daysBetween, weekdayOf, toEpoch, fromEpoch,
} from "@/lib/scheduler/calendar";
import { SEMESTER } from "./fixtures";

describe("civil date arithmetic", () => {
  it("round-trips a date without timezone drift", () => {
    expect(fromEpoch(toEpoch("2025-08-11"))).toBe("2025-08-11");
    expect(fromEpoch(toEpoch("2025-01-01"))).toBe("2025-01-01");
    expect(fromEpoch(toEpoch("2025-12-31"))).toBe("2025-12-31");
  });

  it("knows the weekday of a date", () => {
    expect(weekdayOf("2025-07-21")).toBe(1); // Monday
    expect(weekdayOf("2025-07-26")).toBe(6); // Saturday
    expect(weekdayOf("2025-07-27")).toBe(0); // Sunday
  });

  it("adds days across a month boundary", () => {
    expect(addDays("2025-07-31", 1)).toBe("2025-08-01");
    expect(addDays("2025-03-01", -1)).toBe("2025-02-28");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29"); // leap year
  });

  it("counts days between dates", () => {
    expect(daysBetween("2025-07-21", "2025-07-28")).toBe(7);
    expect(daysBetween("2025-07-28", "2025-07-21")).toBe(-7);
  });

  it("rejects impossible dates rather than rolling them over", () => {
    expect(() => toEpoch("2025-02-30")).toThrow();
    expect(() => toEpoch("2025-13-01")).toThrow();
    expect(() => toEpoch("not-a-date")).toThrow();
  });
});

describe("buildTeachingDays", () => {
  it("derives weekdays in the range and nothing else", () => {
    const days = buildTeachingDays(SEMESTER);
    expect(days.length).toBeGreaterThan(60);
    expect(days.every((d) => [1, 2, 3, 4, 5].includes(d.weekday))).toBe(true);
    expect(days[0].date).toBe("2025-07-21");
  });

  it("does not assume every Monday to Friday date is usable", () => {
    const days = buildTeachingDays({
      ...SEMESTER,
      exceptions: [{ date: "2025-08-15", kind: "HOLIDAY", label: "Independence Day" }],
    });
    expect(days.some((d) => d.date === "2025-08-15")).toBe(false);
  });

  it("blocks a multi-day exam window", () => {
    const days = buildTeachingDays({
      ...SEMESTER,
      exceptions: [{ date: "2025-09-08", endDate: "2025-09-12", kind: "EXAM", label: "Mid-terms" }],
    });
    for (const d of ["2025-09-08", "2025-09-09", "2025-09-10", "2025-09-11", "2025-09-12"]) {
      expect(days.some((x) => x.date === d)).toBe(false);
    }
    expect(days.some((x) => x.date === "2025-09-15")).toBe(true);
  });

  it("adds a special working Saturday that follows another weekday's pattern", () => {
    const days = buildTeachingDays({
      ...SEMESTER,
      exceptions: [{
        date: "2025-08-09", kind: "SPECIAL_WORKING",
        label: "Makeup day", followsWeekday: 1,
      }],
    });
    const special = days.find((d) => d.date === "2025-08-09");
    expect(special).toBeDefined();
    expect(special!.weekday).toBe(6);       // it really is a Saturday
    expect(special!.patternWeekday).toBe(1); // but it runs Monday's timetable
  });

  it("lets a holiday win over a special working day on the same date", () => {
    const days = buildTeachingDays({
      ...SEMESTER,
      exceptions: [
        { date: "2025-08-09", kind: "SPECIAL_WORKING", label: "Makeup", followsWeekday: 1 },
        { date: "2025-08-09", kind: "HOLIDAY", label: "Called off" },
      ],
    });
    expect(days.some((d) => d.date === "2025-08-09")).toBe(false);
  });

  it("counts teaching weeks and per-weekday occurrences", () => {
    const days = buildTeachingDays(SEMESTER);
    expect(teachingWeekCount(days)).toBe(14);
    const occ = weekdayOccurrences(days);
    expect(occ.get(1)).toBe(14);
    expect(occ.get(5)).toBe(14);
    expect(occ.get(6)).toBeUndefined();
  });

  it("returns nothing when no weekday is a teaching day", () => {
    expect(buildTeachingDays({ ...SEMESTER, teachingWeekdays: [] })).toHaveLength(0);
  });

  it("refuses a semester that ends before it starts", () => {
    expect(() => buildTeachingDays({ ...SEMESTER, startDate: "2025-10-24", endDate: "2025-07-21" }))
      .toThrow(/before its start/i);
  });
});
