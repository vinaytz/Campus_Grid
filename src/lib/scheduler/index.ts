import { connectAndRegister } from "@/lib/db";
import Settings from "@/models/Settings";
import Semester from "@/models/Semester";
import TimeSlot from "@/models/TimeSlot";
import Room from "@/models/Room";
import Faculty from "@/models/Faculty";
import Section from "@/models/Section";
import Assignment from "@/models/Assignment";
import { solve } from "./engine";
import { buildTeachingDays, teachingWeekCount } from "./calendar";
import { expandToSemester, type PatternCell } from "./expand";
import { auditTimetable } from "./audit";
import { scoreTimetable } from "./score";
import type {
  AssignmentRef, DatedSession, FacultyRef, RoomRef, SchedulerRules, SectionRef,
  Session, SlotRef, SolverInput, TeachingDay,
} from "./types";

export * from "./types";
export { solve, buildWindows } from "./engine";
export { buildTeachingDays, teachingWeekCount, weekdayOccurrences, addDays, weekdayOf, daysBetween } from "./calendar";
export { expandToSemester, distributedTrimIndices } from "./expand";
export { auditTimetable } from "./audit";
export { scoreTimetable } from "./score";
export { roomSatisfies, eligibleRoomsFor, describeRequirement } from "./rooms";
export { validateMove, roomOptionsForMove } from "./moves";
export { validatePattern } from "./moves";
export { minutesOf, slotsInWindow, spanOf, spanIsContiguous } from "./time";

function err(message: string, status = 400) {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  return e;
}

export interface SchedulingUniverse {
  settings: any;
  semester: any;
  teachingDays: TeachingDay[];
  slots: SlotRef[];
  rooms: RoomRef[];
  faculty: FacultyRef[];
  sections: SectionRef[];
  assignments: AssignmentRef[];
  rules: SchedulerRules;
  raw: { assignments: any[] };
}

const DEFAULT_WEIGHTS = {
  sectionBalance: 1, facultyBalance: 1, afternoonBreak: 1, subjectSpacing: 1,
  consecutive: 1, gaps: 1, tailDistribution: 1, roomFit: 1,
};

/** Reads the whole scheduling universe out of Mongo, normalised for the solver. */
export async function loadUniverse(opts: {
  sections?: string[];
  semesterId?: string;
} = {}): Promise<SchedulingUniverse> {
  await connectAndRegister();

  const [settings, slots, rooms, faculty, sections] = await Promise.all([
    Settings.findOne().lean(),
    TimeSlot.find({ active: true }).sort({ order: 1 }).lean(),
    Room.find({ active: true }).lean(),
    Faculty.find({ active: true }).lean(),
    Section.find({ active: true }).lean(),
  ]);

  const semester = opts.semesterId
    ? await Semester.findById(opts.semesterId).lean()
    : await Semester.findOne({ active: true }).sort({ updatedAt: -1 }).lean();

  const filter: Record<string, unknown> = { active: true };
  if (opts.sections?.length) filter.section = { $in: opts.sections };

  const rawAssignments = await Assignment.find(filter)
    .populate("subject", "code name type")
    .populate("section", "number strength")
    .populate("faculty", "name facultyId")
    .lean();

  const rules: SchedulerRules = {
    maxHoursPerDayPerSection: settings?.maxHoursPerDayPerSection ?? 7,
    maxConsecutiveHoursPerFaculty: settings?.maxConsecutiveHoursPerFaculty ?? 3,
    allowSessionsAcrossBreak: settings?.allowSessionsAcrossBreak ?? false,
    maxSessionsPerAssignmentPerDay: settings?.maxSessionsPerAssignmentPerDay ?? 1,
    preferAfternoonBreak: settings?.preferAfternoonBreak ?? true,
    afternoonWindowStart: settings?.afternoonWindowStart ?? "12:00",
    afternoonWindowEnd: settings?.afternoonWindowEnd ?? "15:00",
    weights: { ...DEFAULT_WEIGHTS, ...(settings?.weights ?? {}) },
  };

  const teachingDays = semester
    ? buildTeachingDays({
        startDate: semester.startDate,
        endDate: semester.endDate,
        teachingWeekdays: semester.teachingWeekdays ?? [1, 2, 3, 4, 5],
        exceptions: semester.exceptions ?? [],
      })
    : [];

  const assignments: AssignmentRef[] = (rawAssignments as any[]).map((a) => ({
    id: String(a._id),
    sectionId: String(a.section?._id ?? a.section),
    sectionNumber: a.section?.number ?? "?",
    subjectId: String(a.subject?._id ?? a.subject),
    subjectCode: a.subject?.code ?? "—",
    subjectName: a.subject?.name ?? "",
    facultyId: String(a.faculty?._id ?? a.faculty),
    facultyName: a.faculty?.name ?? "",
    kind: a.kind,
    duration: a.duration,
    requiredSessions: a.requiredSessions,
    targetWeeklyFrequency: a.targetWeeklyFrequency ?? null,
    roomSelection: a.roomSelection ?? "AUTO",
    fixedRoom: a.fixedRoom ? String(a.fixedRoom) : undefined,
    allowedRooms: (a.allowedRooms ?? []).map((r: any) => String(r)),
    requiredRoomType: a.requiredRoomType,
    requiredCapabilities: a.requiredCapabilities ?? [],
  }));

  return {
    settings,
    semester,
    teachingDays,
    slots: (slots as any[]).map((s) => ({
      order: s.order, kind: s.kind, start: s.start, end: s.end, label: s.label,
    })),
    rooms: (rooms as any[]).map((r) => ({
      id: String(r._id), code: r.code, block: r.block, capacity: r.capacity,
      type: r.type, capabilities: r.capabilities ?? [],
    })),
    faculty: (faculty as any[]).map((f) => ({
      id: String(f._id), facultyId: f.facultyId, name: f.name,
      maxHoursPerWeek: f.maxHoursPerWeek, maxHoursPerDay: f.maxHoursPerDay,
      unavailability: f.unavailability ?? [],
    })),
    sections: (sections as any[]).map((s) => ({
      id: String(s._id), number: s.number, strength: s.strength,
      homeRoom: s.homeRoom ? String(s.homeRoom) : undefined,
    })),
    assignments,
    rules,
    raw: { assignments: rawAssignments as any[] },
  };
}

/**
 * How many cells of the weekly pattern to create for an assignment.
 *
 * The pattern is a means, not the deliverable: `requiredSessions` is what must
 * hold at the end. We size the pattern so that expanding it over the term lands
 * near the target, then reconciliation trims or tops up to the exact figure.
 * `targetWeeklyFrequency`, when set, is used as the starting guess but is capped
 * so it can never demand more sessions than the semester has room for.
 */
export function weeklyCellsFor(a: AssignmentRef, weeks: number): number {
  if (weeks <= 0) return 0;
  const ideal = a.requiredSessions / weeks;
  const hinted = a.targetWeeklyFrequency && a.targetWeeklyFrequency > 0
    ? a.targetWeeklyFrequency
    : Math.ceil(ideal);
  // Never fewer than the ideal rate (that would guarantee a deficit), never
  // more than 6 a week (a pattern that dense stops being a weekly rhythm).
  return Math.max(1, Math.min(6, Math.max(hinted, Math.ceil(ideal))));
}

export interface GenerateOptions {
  sections?: string[];
  semesterId?: string;
  seed?: number;
}

export interface GenerateOutcome {
  entries: any[];
  sessions: any[];
  stats: {
    requested: number;
    scheduled: number;
    patternPlaced: number;
    perAssignment: { assignment: string; label: string; required: number; scheduled: number }[];
    unscheduled: { assignment: string; reason: string }[];
    softScore: number;
    softBreakdown: Record<string, number>;
    warnings: string[];
    feasible: boolean;
    durationMs: number;
  };
  audit: ReturnType<typeof auditTimetable>;
  universe: SchedulingUniverse;
}

/**
 * Full pipeline: normalise → validate inputs → weekly pattern → expand over the
 * calendar → reconcile to exact counts → score → independently validate.
 */
export async function generateTimetable(opts: GenerateOptions = {}): Promise<GenerateOutcome> {
  const started = Date.now();
  const u = await loadUniverse(opts);

  // ── Input validation ────────────────────────────────────────────────────
  if (u.assignments.length === 0) throw err("There are no active assignments to schedule yet.");
  if (u.slots.filter((s) => s.kind === "CLASS").length === 0) {
    throw err("Add at least one teaching period before generating.");
  }
  if (!u.semester) {
    throw err("Create a semester with its start date, end date and teaching weekdays before generating.");
  }
  if (u.teachingDays.length === 0) {
    throw err("This semester's calendar has no teaching days. Check the date range, weekdays and holidays.");
  }
  if (u.rooms.length === 0) throw err("Add at least one active room before generating.");

  const weeks = teachingWeekCount(u.teachingDays);

  // ── 1. Weekly pattern ───────────────────────────────────────────────────
  const patternSessions: Session[] = [];
  for (const a of u.assignments) {
    const cells = weeklyCellsFor(a, weeks);
    for (let i = 0; i < cells; i++) {
      patternSessions.push({
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
      });
    }
  }

  const patternWeekdays = [...new Set(u.teachingDays.map((d) => d.patternWeekday))].sort();

  const solverInput: SolverInput = {
    days: patternWeekdays,
    slots: u.slots,
    rooms: u.rooms,
    faculty: u.faculty,
    sections: u.sections,
    sessions: patternSessions,
    rules: u.rules,
    seed: opts.seed,
  };

  const solved = solve(solverInput);

  const pattern: PatternCell[] = Object.entries(solved.placements).map(([key, p]) => ({
    assignmentId: key.split("#")[0],
    day: p.day,
    slotOrder: p.slotOrder,
    duration: p.duration,
    roomId: p.roomId,
  }));

  // ── 2 & 3. Expand across the calendar, reconcile to exact counts ─────────
  const expanded = expandToSemester({
    assignments: u.assignments,
    pattern,
    teachingDays: u.teachingDays,
    slots: u.slots,
    rooms: u.rooms,
    sections: u.sections,
    faculty: u.faculty,
    rules: u.rules,
  });

  // A pattern cell the solver could not place shows up as a deficit above and is
  // usually closed by the remainder search; only surface the solver's own
  // diagnosis for assignments that still fall short.
  const stillShort = new Set(
    expanded.perAssignment.filter((p) => p.scheduled !== p.required).map((p) => p.label)
  );
  const unscheduled = [
    ...expanded.unscheduled,
    ...solved.unplaced
      .filter((up) => stillShort.has(up.label))
      .filter((up) => !expanded.unscheduled.some((x) => x.assignment === up.label))
      .map((up) => ({ assignment: up.label, reason: up.reason })),
  ];

  // ── 4. Score ────────────────────────────────────────────────────────────
  const score = scoreTimetable({
    sessions: expanded.sessions,
    assignments: u.assignments,
    teachingDays: u.teachingDays,
    slots: u.slots,
    sections: u.sections,
    faculty: u.faculty,
    rooms: u.rooms,
    rules: u.rules,
  });

  // ── 5. Independent validation ───────────────────────────────────────────
  const audit = auditTimetable({
    sessions: expanded.sessions,
    assignments: u.assignments,
    teachingDays: u.teachingDays,
    slots: u.slots,
    rooms: u.rooms,
    sections: u.sections,
    faculty: u.faculty,
    rules: u.rules,
  });

  const byId = new Map(u.raw.assignments.map((a: any) => [String(a._id), a]));

  const entries = pattern.map((c) => {
    const a = byId.get(c.assignmentId) as any;
    return {
      assignment: a._id,
      day: c.day,
      slotOrder: c.slotOrder,
      duration: c.duration,
      section: a.section?._id ?? a.section,
      subject: a.subject?._id ?? a.subject,
      faculty: a.faculty?._id ?? a.faculty,
      room: c.roomId,
      kind: a.kind,
      locked: false,
    };
  });

  const sessions = expanded.sessions.map((s) => {
    const a = s.assignmentId ? (byId.get(s.assignmentId) as any) : null;
    return {
      assignment: a?._id,
      date: s.date,
      day: s.day,
      slotOrder: s.slotOrder,
      duration: s.duration,
      section: a?.section?._id ?? a?.section ?? s.sectionId,
      subject: a?.subject?._id ?? a?.subject ?? s.subjectId,
      faculty: a?.faculty?._id ?? a?.faculty ?? s.facultyId,
      room: s.roomId,
      kind: s.kind,
      type: s.type,
      locked: s.locked,
      reason: s.reason,
    };
  });

  const requested = u.assignments.reduce((n, a) => n + a.requiredSessions, 0);

  const warnings = [...score.warnings];
  if (expanded.trimmed > 0) {
    warnings.unshift(`${expanded.trimmed} surplus occurrence(s) were trimmed to hit the exact session counts.`);
  }
  if (expanded.added > 0) {
    warnings.unshift(`${expanded.added} extra session(s) were placed to close shortfalls in the weekly pattern.`);
  }

  return {
    entries,
    sessions,
    stats: {
      requested,
      scheduled: expanded.sessions.filter((s) => s.type === "REGULAR").length,
      patternPlaced: pattern.length,
      perAssignment: expanded.perAssignment.map((p) => ({
        assignment: p.assignmentId,
        label: p.label,
        required: p.required,
        scheduled: p.scheduled,
      })),
      unscheduled,
      softScore: score.total,
      softBreakdown: score.breakdown,
      warnings,
      feasible: expanded.feasible && audit.publishable,
      durationMs: Date.now() - started,
    },
    audit,
    universe: u,
  };
}

/**
 * Re-runs the independent validator over a timetable's stored sessions.
 * This is what the publish gate consults — never the generator's own opinion.
 */
export async function revalidateTimetable(doc: any) {
  const u = await loadUniverse({ semesterId: doc.semester ? String(doc.semester) : undefined });

  const sessions: DatedSession[] = (doc.sessions ?? []).map((s: any) => ({
    assignmentId: s.assignment ? String(s.assignment._id ?? s.assignment) : undefined,
    date: s.date,
    day: s.day,
    slotOrder: s.slotOrder,
    duration: s.duration,
    sectionId: String(s.section?._id ?? s.section),
    subjectId: String(s.subject?._id ?? s.subject),
    facultyId: String(s.faculty?._id ?? s.faculty),
    roomId: String(s.room?._id ?? s.room),
    kind: s.kind,
    type: s.type ?? "REGULAR",
    locked: !!s.locked,
    reason: s.reason,
  }));

  const audit = auditTimetable({
    sessions,
    assignments: u.assignments,
    teachingDays: u.teachingDays,
    slots: u.slots,
    rooms: u.rooms,
    sections: u.sections,
    faculty: u.faculty,
    rules: u.rules,
  });

  const score = scoreTimetable({
    sessions,
    assignments: u.assignments,
    teachingDays: u.teachingDays,
    slots: u.slots,
    sections: u.sections,
    faculty: u.faculty,
    rooms: u.rooms,
    rules: u.rules,
  });

  return { audit, score, universe: u, sessions };
}
