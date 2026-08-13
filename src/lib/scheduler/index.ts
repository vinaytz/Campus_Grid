import { connectAndRegister } from "@/lib/db";
import Settings from "@/models/Settings";
import TimeSlot from "@/models/TimeSlot";
import Room from "@/models/Room";
import Faculty from "@/models/Faculty";
import Section from "@/models/Section";
import Assignment from "@/models/Assignment";
import { solve } from "./engine";
import type { Session, SolverInput } from "./types";

export * from "./types";
export { solve } from "./engine";

/** Reads the whole scheduling universe out of Mongo and expands it into sessions. */
export async function buildSolverInput(opts: { sections?: string[]; seed?: number } = {}) {
  await connectAndRegister();

  const [settings, slots, rooms, faculty, sections] = await Promise.all([
    Settings.findOne().lean(),
    TimeSlot.find({ active: true }).sort({ order: 1 }).lean(),
    Room.find({ active: true }).lean(),
    Faculty.find({ active: true }).lean(),
    Section.find({ active: true }).lean(),
  ]);

  const filter: Record<string, unknown> = { active: true };
  if (opts.sections?.length) filter.section = { $in: opts.sections };

  const assignments = await Assignment.find(filter)
    .populate("subject", "code name")
    .lean();

  const sessions: Session[] = [];
  for (const a of assignments as any[]) {
    for (let i = 0; i < a.sessionsPerWeek; i++) {
      sessions.push({
        key: `${a._id}#${i}`,
        assignmentId: String(a._id),
        sectionId: String(a.section),
        subjectId: String(a.subject?._id ?? a.subject),
        subjectCode: a.subject?.code ?? "—",
        facultyId: String(a.faculty),
        kind: a.kind,
        duration: a.duration,
        requiredRoomType: a.requiredRoomType,
        fixedRoom: a.fixedRoom ? String(a.fixedRoom) : undefined,
        occurrence: i,
      });
    }
  }

  const input: SolverInput = {
    days: settings?.workingDays ?? [1, 2, 3, 4, 5],
    slots: (slots as any[]).map((s) => ({
      order: s.order, kind: s.kind, start: s.start, end: s.end, label: s.label,
    })),
    rooms: (rooms as any[]).map((r) => ({
      id: String(r._id), code: r.code, block: r.block, capacity: r.capacity, type: r.type,
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
    sessions,
    rules: {
      maxHoursPerDayPerSection: settings?.maxHoursPerDayPerSection ?? 7,
      maxConsecutiveHoursPerFaculty: settings?.maxConsecutiveHoursPerFaculty ?? 3,
      allowSessionsAcrossBreak: settings?.allowSessionsAcrossBreak ?? false,
    },
    seed: opts.seed,
  };

  return { input, assignments: assignments as any[] };
}

/** Runs the solver and shapes the output into Timetable entry documents. */
export async function generateTimetable(opts: { sections?: string[]; seed?: number } = {}) {
  const { input, assignments } = await buildSolverInput(opts);

  if (input.sessions.length === 0) {
    const e = new Error("There are no active assignments to schedule yet.") as Error & { status?: number };
    e.status = 400;
    throw e;
  }
  if (input.slots.filter((s) => s.kind === "CLASS").length === 0) {
    const e = new Error("Add at least one teaching period before generating.") as Error & { status?: number };
    e.status = 400;
    throw e;
  }

  const result = solve(input);
  const byAssignment = new Map(assignments.map((a) => [String(a._id), a]));

  const entries = Object.entries(result.placements).map(([key, p]) => {
    const a = byAssignment.get(key.split("#")[0]);
    return {
      assignment: a._id,
      day: p.day,
      slotOrder: p.slotOrder,
      duration: p.duration,
      section: a.section,
      subject: a.subject?._id ?? a.subject,
      faculty: a.faculty,
      room: p.roomId,
      kind: a.kind,
      locked: false,
    };
  });

  return { entries, result };
}

/**
 * Checks a manual drag-and-drop move against the same hard rules the solver
 * uses, so the grid can never be edited into an invalid state.
 */
export function findConflicts(
  entries: any[],
  moved: { id: string; day: number; slotOrder: number; duration: number; room: string; section: string; faculty: string },
) {
  const span = new Set(
    Array.from({ length: moved.duration }, (_, i) => moved.slotOrder + i)
  );
  const conflicts: string[] = [];

  for (const e of entries) {
    if (String(e._id) === moved.id) continue;
    if (e.day !== moved.day) continue;
    const overlaps = Array.from({ length: e.duration }, (_, i) => e.slotOrder + i)
      .some((o) => span.has(o));
    if (!overlaps) continue;

    if (String(e.section?._id ?? e.section) === moved.section)
      conflicts.push(`Section already has ${e.subject?.code ?? "a class"} in this period.`);
    if (String(e.faculty?._id ?? e.faculty) === moved.faculty)
      conflicts.push(`${e.faculty?.name ?? "That faculty member"} is teaching elsewhere in this period.`);
    if (String(e.room?._id ?? e.room) === moved.room)
      conflicts.push(`Room is occupied by ${e.subject?.code ?? "another class"} in this period.`);
  }
  return [...new Set(conflicts)];
}
