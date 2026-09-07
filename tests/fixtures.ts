/**
 * Shared fixtures for the scheduler tests.
 *
 * Everything the scheduler needs is a plain object, so these tests run against
 * the real solver, expander, validator and scorer with no database at all.
 */

import type {
  AssignmentRef, FacultyRef, RoomRef, SchedulerRules, SectionRef, SlotRef,
} from "@/lib/scheduler/types";

/** Nine periods with a genuine clock gap between P4 and P5. */
export const SLOTS: SlotRef[] = [
  { order: 0, label: "P1", start: "09:00", end: "09:50", kind: "CLASS" },
  { order: 1, label: "P2", start: "09:50", end: "10:40", kind: "CLASS" },
  { order: 2, label: "P3", start: "10:40", end: "11:30", kind: "CLASS" },
  { order: 3, label: "P4", start: "11:30", end: "12:20", kind: "CLASS" },
  { order: 4, label: "P5", start: "12:20", end: "13:10", kind: "CLASS" },
  { order: 5, label: "P6", start: "13:10", end: "14:00", kind: "CLASS" },
  { order: 6, label: "P7", start: "14:00", end: "14:50", kind: "CLASS" },
  { order: 7, label: "P8", start: "14:50", end: "15:40", kind: "CLASS" },
  { order: 8, label: "P9", start: "15:40", end: "16:30", kind: "CLASS" },
];

/** Same grid, but with an explicit BREAK period at order 4. */
export const SLOTS_WITH_BREAK: SlotRef[] = SLOTS.map((s) =>
  s.order === 4 ? { ...s, label: "Lunch", kind: "BREAK" as const } : s
);

/** Same grid, but P4→P5 has a 25-minute clock gap and no BREAK slot. */
export const SLOTS_WITH_GAP: SlotRef[] = SLOTS.map((s) =>
  s.order === 4 ? { ...s, start: "12:45", end: "13:35" } : s
);

export const ROOMS: RoomRef[] = [
  { id: "r-a101", code: "101", block: "A", capacity: 70, type: "CLASSROOM", capabilities: ["PROJECTOR"] },
  { id: "r-a102", code: "102", block: "A", capacity: 70, type: "CLASSROOM", capabilities: ["PROJECTOR"] },
  { id: "r-a103", code: "103", block: "A", capacity: 40, type: "CLASSROOM", capabilities: [] },
  { id: "r-b301", code: "301", block: "B", capacity: 65, type: "LAB", capabilities: ["COMPUTER", "PROJECTOR"] },
  { id: "r-b302", code: "302", block: "B", capacity: 65, type: "LAB", capabilities: ["COMPUTER", "BYOD"] },
  { id: "r-c401", code: "401", block: "C", capacity: 150, type: "AUDITORIUM", capabilities: ["PROJECTOR"] },
];

export const SECTIONS: SectionRef[] = [
  { id: "s-2403", number: "2403", strength: 58 },
  { id: "s-2404", number: "2404", strength: 62 },
];

export const FACULTY: FacultyRef[] = [
  { id: "f-1", facultyId: "23314", name: "Praveen Malik", maxHoursPerWeek: 18, maxHoursPerDay: 5, unavailability: [] },
  { id: "f-2", facultyId: "23315", name: "Anjali Sharma", maxHoursPerWeek: 18, maxHoursPerDay: 5, unavailability: [] },
];

export const RULES: SchedulerRules = {
  maxHoursPerDayPerSection: 7,
  maxConsecutiveHoursPerFaculty: 3,
  allowSessionsAcrossBreak: false,
  maxSessionsPerAssignmentPerDay: 1,
  preferAfternoonBreak: true,
  afternoonWindowStart: "12:00",
  afternoonWindowEnd: "15:00",
  weights: {
    sectionBalance: 1, facultyBalance: 1, afternoonBreak: 1, subjectSpacing: 1,
    consecutive: 1, gaps: 1, tailDistribution: 1, roomFit: 1,
  },
};

let seq = 0;

export function assignment(over: Partial<AssignmentRef> = {}): AssignmentRef {
  seq++;
  return {
    id: over.id ?? `a-${seq}`,
    sectionId: "s-2403",
    sectionNumber: "2403",
    subjectId: `sub-${seq}`,
    subjectCode: `SUB${100 + seq}`,
    subjectName: `Subject ${seq}`,
    facultyId: "f-1",
    facultyName: "Praveen Malik",
    kind: "LECTURE",
    duration: 1,
    requiredSessions: 10,
    targetWeeklyFrequency: null,
    roomSelection: "AUTO",
    allowedRooms: [],
    requiredCapabilities: [],
    ...over,
  };
}

/** A one-term semester spec: 14 weeks of Mon–Fri from a Monday. */
export const SEMESTER = {
  startDate: "2025-07-21", // a Monday
  endDate: "2025-10-24",
  teachingWeekdays: [1, 2, 3, 4, 5],
  exceptions: [] as any[],
};
