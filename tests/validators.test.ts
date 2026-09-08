import { describe, it, expect } from "vitest";
import {
  roomSchema, subjectSchema, facultySchema, assignmentSchema, semesterSchema, settingsSchema,
} from "@/lib/validators";

const OID = "507f1f77bcf86cd799439011";
const OID2 = "507f1f77bcf86cd799439012";
const OID3 = "507f1f77bcf86cd799439013";

describe("spreadsheet-tolerant coercion", () => {
  it("reads a no/false/0 active cell as inactive, not active", () => {
    // Boolean("no") is true, so a naive coercion would silently import an
    // inactive row as active. These spellings must all mean inactive.
    for (const v of ["no", "No", "NO", "false", "0", "off", "inactive", "n"]) {
      const parsed = roomSchema.parse({ code: "1", block: "A", capacity: 10, active: v });
      expect(parsed.active, `"${v}" should mean inactive`).toBe(false);
    }
  });

  it("reads yes-ish and blank cells as active", () => {
    for (const v of ["yes", "y", "true", "1", "TRUE", undefined, ""]) {
      const parsed = roomSchema.parse({ code: "1", block: "A", capacity: 10, active: v });
      expect(parsed.active, `"${v}" should mean active`).toBe(true);
    }
  });

  it("passes real booleans through untouched", () => {
    expect(roomSchema.parse({ code: "1", block: "A", capacity: 10, active: false }).active).toBe(false);
    expect(roomSchema.parse({ code: "1", block: "A", capacity: 10, active: true }).active).toBe(true);
  });

  it("splits a capability cell on commas, semicolons or pipes", () => {
    for (const cell of ["COMPUTER;BYOD", "COMPUTER,BYOD", "COMPUTER|BYOD", " computer ; byod "]) {
      const parsed = roomSchema.parse({ code: "1", block: "A", capacity: 10, capabilities: cell });
      expect(parsed.capabilities.sort()).toEqual(["BYOD", "COMPUTER"]);
    }
  });

  it("accepts a capability array as well as text", () => {
    expect(roomSchema.parse({ code: "1", block: "A", capacity: 10, capabilities: ["byod"] }).capabilities)
      .toEqual(["BYOD"]);
  });

  it("drops duplicate capabilities", () => {
    expect(roomSchema.parse({ code: "1", block: "A", capacity: 10, capabilities: "BYOD;byod;BYOD" }).capabilities)
      .toEqual(["BYOD"]);
  });

  it("falls back to a default for a blank numeric cell", () => {
    const f = facultySchema.parse({ facultyId: "1", name: "Someone", maxHoursPerDay: "", maxHoursPerWeek: "" });
    expect(f.maxHoursPerDay).toBe(5);
    expect(f.maxHoursPerWeek).toBe(18);
    expect(subjectSchema.parse({ code: "AB1", name: "Thing", department: "X", defaultDuration: "" }).defaultDuration).toBe(1);
  });

  it("still rejects a numeric cell that is present but nonsense", () => {
    expect(facultySchema.safeParse({ facultyId: "1", name: "Someone", maxHoursPerDay: "99" }).success).toBe(false);
    expect(roomSchema.safeParse({ code: "1", block: "A", capacity: "0" }).success).toBe(false);
  });

  it("treats a blank weekly hint as not set, never as zero", () => {
    const base = { section: OID, subject: OID2, faculty: OID3, requiredSessions: 40 };
    expect(assignmentSchema.parse({ ...base, targetWeeklyFrequency: "" }).targetWeeklyFrequency).toBeNull();
    expect(assignmentSchema.parse(base).targetWeeklyFrequency).toBeNull();
    expect(assignmentSchema.parse({ ...base, targetWeeklyFrequency: "3" }).targetWeeklyFrequency).toBe(3);
  });
});

describe("assignment schedulingRules", () => {
  const base = { section: OID, subject: OID2, faculty: OID3 };

  it("requires an exact semester session count", () => {
    expect(assignmentSchema.safeParse(base).success).toBe(false);
    expect(assignmentSchema.parse({ ...base, requiredSessions: 40 }).requiredSessions).toBe(40);
  });

  it("rejects a session count below one or beyond a semester", () => {
    expect(assignmentSchema.safeParse({ ...base, requiredSessions: 0 }).success).toBe(false);
    expect(assignmentSchema.safeParse({ ...base, requiredSessions: 500 }).success).toBe(false);
  });

  it("insists a FIXED assignment actually names its room", () => {
    const bad = assignmentSchema.safeParse({ ...base, requiredSessions: 10, roomSelection: "FIXED" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.errors[0].message).toMatch(/pick the room/i);

    expect(assignmentSchema.safeParse({
      ...base, requiredSessions: 10, roomSelection: "FIXED", fixedRoom: OID,
    }).success).toBe(true);
  });

  it("insists an ALLOWED_ROOMS assignment lists at least one room", () => {
    const bad = assignmentSchema.safeParse({
      ...base, requiredSessions: 10, roomSelection: "ALLOWED_ROOMS", allowedRooms: [],
    });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.errors[0].message).toMatch(/at least one permitted room/i);

    expect(assignmentSchema.safeParse({
      ...base, requiredSessions: 10, roomSelection: "ALLOWED_ROOMS", allowedRooms: `${OID};${OID2}`,
    }).success).toBe(true);
  });

  it("defaults to automatic room selection", () => {
    expect(assignmentSchema.parse({ ...base, requiredSessions: 10 }).roomSelection).toBe("AUTO");
  });
});

describe("semester schedulingRules", () => {
  const base = {
    name: "Odd 2025", academicYear: "2025-26", term: "Odd",
    startDate: "2025-07-21", endDate: "2025-10-31", teachingWeekdays: [1, 2, 3, 4, 5],
  };

  it("accepts a well-formed calendar", () => {
    expect(semesterSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an end date before the start date", () => {
    const bad = semesterSchema.safeParse({ ...base, endDate: "2025-01-01" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.errors[0].message).toMatch(/on or after the start/i);
  });

  it("requires at least one teaching weekday", () => {
    expect(semesterSchema.safeParse({ ...base, teachingWeekdays: [] }).success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(semesterSchema.safeParse({ ...base, startDate: "21/07/2025" }).success).toBe(false);
  });

  it("accepts a special working day that follows another weekday", () => {
    const parsed = semesterSchema.parse({
      ...base,
      exceptions: [{ date: "2025-08-23", kind: "SPECIAL_WORKING", label: "Makeup", followsWeekday: "5" }],
    });
    expect(parsed.exceptions[0].followsWeekday).toBe(5);
  });

  it("normalises a blank followsWeekday to null rather than 0", () => {
    // 0 is Sunday, so silently turning a blank into 0 would move classes.
    const parsed = semesterSchema.parse({
      ...base,
      exceptions: [{ date: "2025-08-23", kind: "HOLIDAY", label: "Break", followsWeekday: "" }],
    });
    expect(parsed.exceptions[0].followsWeekday).toBeNull();
  });
});

describe("settings schedulingRules", () => {
  const base = {
    institutionName: "IT", academicYear: "2025-26", term: "Odd",
    workingDays: [1, 2, 3, 4, 5],
    maxHoursPerDayPerSection: 7,
    maxConsecutiveHoursPerFaculty: 3,
    afternoonWindowStart: "12:00",
    afternoonWindowEnd: "15:00",
  };

  it("accepts a valid rule set", () => {
    const parsed = settingsSchema.parse(base);
    expect(parsed.maxSessionsPerAssignmentPerDay).toBe(1);
    expect(parsed.preferAfternoonBreak).toBe(true);
    expect(parsed.allowSessionsAcrossBreak).toBe(false);
  });

  it("rejects an afternoon window that ends before it starts", () => {
    const bad = settingsSchema.safeParse({ ...base, afternoonWindowStart: "15:00", afternoonWindowEnd: "12:00" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.errors[0].message).toMatch(/end after it starts/i);
  });

  it("lets a weight be switched off with zero", () => {
    const parsed = settingsSchema.parse({ ...base, weights: { afternoonBreak: 0 } });
    expect(parsed.weights?.afternoonBreak).toBe(0);
  });
});
