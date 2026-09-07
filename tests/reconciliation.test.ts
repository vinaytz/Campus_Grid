import { describe, it, expect } from "vitest";
import { expandToSemester, distributedTrimIndices, type PatternCell } from "@/lib/scheduler/expand";
import { buildTeachingDays, teachingWeekCount } from "@/lib/scheduler/calendar";
import { auditTimetable } from "@/lib/scheduler/audit";
import { SLOTS, ROOMS, SECTIONS, FACULTY, RULES, SEMESTER, assignment } from "./fixtures";

const DAYS = buildTeachingDays(SEMESTER);          // 70 days, 14 weeks, Mon–Fri
const WEEKS = teachingWeekCount(DAYS);

function base(over: Record<string, unknown> = {}) {
  return {
    teachingDays: DAYS,
    slots: SLOTS,
    rooms: ROOMS,
    sections: SECTIONS,
    faculty: FACULTY,
    rules: RULES,
    ...over,
  };
}

function cell(assignmentId: string, day: number, slotOrder: number, over: Partial<PatternCell> = {}): PatternCell {
  return { assignmentId, day, slotOrder, duration: 1, roomId: "r-a101", ...over };
}

describe("distributedTrimIndices", () => {
  it("drops nothing when there is no surplus", () => {
    expect(distributedTrimIndices(10, 0)).toEqual([]);
  });

  it("spreads the drops instead of taking them off one end", () => {
    const drops = distributedTrimIndices(42, 2);
    expect(drops).toHaveLength(2);
    // Neither drop should be at the very start or the very end of the term.
    expect(drops[0]).toBeGreaterThan(2);
    expect(drops[1]).toBeLessThan(40);
  });

  it("never returns a duplicate index", () => {
    for (const [n, s] of [[10, 7], [42, 13], [5, 4], [100, 33]]) {
      const drops = distributedTrimIndices(n, s);
      expect(new Set(drops).size).toBe(drops.length);
      expect(drops).toHaveLength(s);
    }
  });

  it("keeps the drops in range", () => {
    const drops = distributedTrimIndices(9, 5);
    expect(Math.min(...drops)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...drops)).toBeLessThan(9);
  });
});

describe("exact semester session counts", () => {
  it("trims a surplus to land on exactly requiredSessions", () => {
    // 3 cells/week over 14 weeks = 42 candidate occurrences for a course of 40.
    const a = assignment({ id: "a-1", requiredSessions: 40 });
    const res = expandToSemester(base({
      assignments: [a],
      pattern: [cell("a-1", 1, 0), cell("a-1", 3, 0), cell("a-1", 5, 0)],
    }) as any);

    expect(res.sessions).toHaveLength(40);
    expect(res.perAssignment[0]).toEqual({
      assignmentId: "a-1", label: `${a.subjectCode} · §2403`, required: 40, scheduled: 40,
    });
    expect(res.trimmed).toBe(2);
    expect(res.feasible).toBe(true);
  });

  it("does not simply keep the first N chronological occurrences", () => {
    const a = assignment({ id: "a-1", requiredSessions: 40 });
    const res = expandToSemester(base({
      assignments: [a],
      pattern: [cell("a-1", 1, 0), cell("a-1", 3, 0), cell("a-1", 5, 0)],
    }) as any);

    const dates = res.sessions.map((s) => s.date).sort();
    // A naive "first 40" would stop before the final teaching week.
    const lastWeek = DAYS.slice(-5).map((d) => d.date);
    expect(dates.some((d) => lastWeek.includes(d))).toBe(true);
  });

  it("tops up a deficit until the exact count is met", () => {
    // 1 cell/week over 14 weeks = 14 occurrences, but 20 are required.
    const a = assignment({ id: "a-1", requiredSessions: 20 });
    const res = expandToSemester(base({
      assignments: [a],
      pattern: [cell("a-1", 2, 0)],
    }) as any);

    expect(res.sessions).toHaveLength(20);
    expect(res.added).toBe(6);
    expect(res.feasible).toBe(true);
  });

  it("places a deficit from scratch when the pattern has no cells at all", () => {
    const a = assignment({ id: "a-1", requiredSessions: 8 });
    const res = expandToSemester(base({ assignments: [a], pattern: [] }) as any);
    expect(res.sessions).toHaveLength(8);
    expect(res.feasible).toBe(true);
  });

  it("publishes no surplus for any assignment", () => {
    const a = assignment({ id: "a-1", requiredSessions: 13, kind: "LAB", duration: 3, requiredRoomType: "LAB" });
    const b = assignment({ id: "a-2", requiredSessions: 40, facultyId: "f-2" });
    const res = expandToSemester(base({
      assignments: [a, b],
      pattern: [
        cell("a-1", 2, 0, { duration: 3, roomId: "r-b301" }),
        cell("a-2", 1, 4), cell("a-2", 3, 4), cell("a-2", 5, 4),
      ],
    }) as any);

    for (const p of res.perAssignment) expect(p.scheduled).toBe(p.required);
  });

  it("keeps a single assignment to one session per calendar day", () => {
    const a = assignment({ id: "a-1", requiredSessions: 60 });
    const res = expandToSemester(base({
      assignments: [a],
      pattern: [cell("a-1", 1, 0), cell("a-1", 2, 0), cell("a-1", 3, 0), cell("a-1", 4, 0), cell("a-1", 5, 0)],
    }) as any);

    const perDay = new Map<string, number>();
    for (const s of res.sessions) perDay.set(s.date, (perDay.get(s.date) ?? 0) + 1);
    expect([...perDay.values()].every((n) => n === 1)).toBe(true);
  });

  it("reports INFEASIBLE with a reason rather than a misleading success", () => {
    // 71 sessions demanded, but the cap of one per day allows at most 70.
    const a = assignment({ id: "a-1", requiredSessions: DAYS.length + 1 });
    const res = expandToSemester(base({
      assignments: [a],
      pattern: [cell("a-1", 1, 0), cell("a-1", 2, 0), cell("a-1", 3, 0), cell("a-1", 4, 0), cell("a-1", 5, 0)],
    }) as any);

    expect(res.feasible).toBe(false);
    expect(res.unscheduled).toHaveLength(1);
    expect(res.unscheduled[0].reason).toMatch(/only \d+ could be placed/i);
    expect(res.perAssignment[0].scheduled).toBeLessThan(res.perAssignment[0].required);
  });

  it("skips dates blocked by the calendar", () => {
    const blocked = buildTeachingDays({
      ...SEMESTER,
      exceptions: [
        { date: "2025-08-15", kind: "HOLIDAY", label: "Independence Day" },
        { date: "2025-09-08", endDate: "2025-09-12", kind: "EXAM", label: "Mid-terms" },
      ],
    });
    const a = assignment({ id: "a-1", requiredSessions: 30 });
    const res = expandToSemester(base({
      teachingDays: blocked,
      assignments: [a],
      pattern: [cell("a-1", 1, 0), cell("a-1", 3, 0), cell("a-1", 5, 0)],
    }) as any);

    const dates = new Set(res.sessions.map((s) => s.date));
    expect(dates.has("2025-08-15")).toBe(false);
    for (const d of ["2025-09-08", "2025-09-09", "2025-09-10", "2025-09-11", "2025-09-12"]) {
      expect(dates.has(d)).toBe(false);
    }
    expect(res.sessions).toHaveLength(30);
  });

  it("uses a special working Saturday as its followed weekday", () => {
    const withSpecial = buildTeachingDays({
      ...SEMESTER,
      exceptions: [{ date: "2025-08-09", kind: "SPECIAL_WORKING", label: "Makeup", followsWeekday: 1 }],
    });
    const a = assignment({ id: "a-1", requiredSessions: 15 });
    const res = expandToSemester(base({
      teachingDays: withSpecial,
      assignments: [a],
      pattern: [cell("a-1", 1, 0)], // Mondays only
    }) as any);

    const special = res.sessions.find((s) => s.date === "2025-08-09");
    expect(special).toBeDefined();
    expect(special!.day).toBe(6); // stored as the real weekday
  });

  it("never trims a pinned occurrence", () => {
    const a = assignment({ id: "a-1", requiredSessions: 40 });
    const res = expandToSemester(base({
      assignments: [a],
      pattern: [
        cell("a-1", 1, 0, { locked: true }),
        cell("a-1", 3, 0),
        cell("a-1", 5, 0),
      ],
    }) as any);

    expect(res.sessions).toHaveLength(40);
    // All 14 Mondays are pinned, so every one must survive.
    const mondays = res.sessions.filter((s) => s.day === 1);
    expect(mondays).toHaveLength(14);
  });

  it("produces a schedule the independent validator accepts", () => {
    const a = assignment({ id: "a-1", requiredSessions: 40 });
    const b = assignment({ id: "a-2", requiredSessions: 13, kind: "LAB", duration: 3, facultyId: "f-2", requiredRoomType: "LAB" });
    const res = expandToSemester(base({
      assignments: [a, b],
      pattern: [
        cell("a-1", 1, 0), cell("a-1", 3, 0), cell("a-1", 5, 0),
        cell("a-2", 2, 0, { duration: 3, roomId: "r-b301" }),
      ],
    }) as any);

    const report = auditTimetable({
      sessions: res.sessions,
      assignments: [a, b],
      teachingDays: DAYS,
      slots: SLOTS,
      rooms: ROOMS,
      sections: SECTIONS,
      faculty: FACULTY,
      rules: RULES,
    });

    expect(report.hardViolations).toEqual([]);
    expect(report.countMismatches).toEqual([]);
    expect(report.publishable).toBe(true);
  });
});

describe("remainder placement quality", () => {
  it("does not dump every reconciled session into the final week", () => {
    // A big deficit: 1 cell/week gives 14, but 34 are required — 20 remainders.
    const a = assignment({ id: "a-1", requiredSessions: 34 });
    const res = expandToSemester(base({
      assignments: [a],
      pattern: [cell("a-1", 2, 0)],
    }) as any);

    expect(res.sessions).toHaveLength(34);

    const lastWeek = new Set(DAYS.slice(-5).map((d) => d.date));
    const inLastWeek = res.sessions.filter((s) => lastWeek.has(s.date)).length;
    // An even spread over 14 weeks puts ~2.4 sessions in the final week. Anything
    // near 20 would mean the remainder search was dumping into the tail.
    expect(inLastWeek).toBeLessThanOrEqual(5);
  });

  it("spreads remainders across many distinct weeks", () => {
    const a = assignment({ id: "a-1", requiredSessions: 34 });
    const res = expandToSemester(base({
      assignments: [a],
      pattern: [cell("a-1", 2, 0)],
    }) as any);

    const weekOf = new Map(DAYS.map((d) => [d.date, d.week]));
    const weeks = new Set(res.sessions.map((s) => weekOf.get(s.date)));
    expect(weeks.size).toBeGreaterThanOrEqual(WEEKS - 1);
  });

  it("keeps the section's daily load balanced while filling remainders", () => {
    const a = assignment({ id: "a-1", requiredSessions: 30 });
    const b = assignment({ id: "a-2", requiredSessions: 30, facultyId: "f-2" });
    const res = expandToSemester(base({
      assignments: [a, b],
      pattern: [cell("a-1", 1, 0), cell("a-2", 1, 1)],
    }) as any);

    const perDay = new Map<string, number>();
    for (const s of res.sessions) perDay.set(s.date, (perDay.get(s.date) ?? 0) + 1);
    // 60 sessions over 70 teaching days should never stack a heavy day.
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(4);
  });

  it("prefers to leave the section an afternoon free period", () => {
    // Enough load to make the window contested, but not enough to force it full.
    const many = Array.from({ length: 4 }, (_, i) =>
      assignment({ id: `a-${i}`, requiredSessions: 40, facultyId: i % 2 ? "f-1" : "f-2" })
    );
    const res = expandToSemester(base({
      assignments: many,
      pattern: many.flatMap((a, i) => [
        cell(a.id, 1, i), cell(a.id, 3, i), cell(a.id, 5, i),
      ]),
    }) as any);

    // Periods 3,4,5,6,7 overlap 12:00–15:00 in the fixture grid.
    const window = [3, 4, 5, 6, 7];
    const perDay = new Map<string, Set<number>>();
    for (const s of res.sessions) {
      const set = perDay.get(s.date) ?? new Set<number>();
      for (let i = 0; i < s.duration; i++) set.add(s.slotOrder + i);
      perDay.set(s.date, set);
    }
    const daysWithBreak = [...perDay.values()].filter(
      (set) => window.some((o) => !set.has(o))
    ).length;
    expect(daysWithBreak).toBe(perDay.size);
  });
});
