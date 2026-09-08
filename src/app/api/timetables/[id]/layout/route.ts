import { connectAndRegister } from "@/lib/db";
import Timetable from "@/models/Timetable";
import { requireAdmin } from "@/lib/auth";
import {
  loadUniverse, validatePattern, expandToSemester, auditTimetable, scoreTimetable,
  type DatedSession,
} from "@/lib/scheduler";
import { ok, fail, handleError } from "@/lib/api";
import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);

const layoutSchema = z.object({
  entries: z.array(z.object({
    assignment: objectId,
    day: z.coerce.number().int().min(0).max(6),
    slotOrder: z.coerce.number().int().min(0),
    duration: z.coerce.number().int().min(1).max(3),
    section: objectId,
    subject: objectId,
    faculty: objectId,
    room: objectId,
    kind: z.enum(["LECTURE", "LAB", "TUTORIAL"]),
    locked: z.boolean().default(false),
  })).max(2000),
});

type Ctx = { params: Promise<{ id: string }> };

/**
 * Replaces the whole weekly pattern in one write.
 *
 * The Studio is the source of truth while an admin is working — it holds the
 * layout locally, validates every move against the same rules the solver uses,
 * and saves the result. Replacing wholesale keeps undo/redo trivially correct:
 * a snapshot is just an array.
 *
 * The server re-validates the whole pattern regardless. The client's checks are
 * for responsiveness; this is the rule that actually holds. Saving a pattern
 * also invalidates the stored validation, because the dated sessions no longer
 * necessarily reflect it — POST re-expands them.
 */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    await connectAndRegister();
    const { id } = await params;
    const body = layoutSchema.parse(await req.json());

    const doc = await Timetable.findById(id);
    if (!doc) return fail("That timetable no longer exists.", 404);
    if (doc.status === "PUBLISHED") {
      return fail("This timetable is published. Move it back to draft before editing.", 409);
    }

    const u = await loadUniverse({ semesterId: doc.semester ? String(doc.semester) : undefined });
    const patternWeekdays = u.teachingDays.length
      ? [...new Set(u.teachingDays.map((d) => d.patternWeekday))].sort()
      : (u.settings?.workingDays ?? [1, 2, 3, 4, 5]);

    const verdict = validatePattern(
      body.entries.map((e) => ({
        assignmentId: e.assignment,
        day: e.day,
        slotOrder: e.slotOrder,
        duration: e.duration,
        roomId: e.room,
      })),
      {
        assignments: u.assignments,
        slots: u.slots,
        rooms: u.rooms,
        sections: u.sections,
        faculty: u.faculty,
        rules: u.rules,
        days: patternWeekdays,
      }
    );

    if (!verdict.ok) return fail(verdict.reasons[0], 409, { reasons: verdict.reasons });

    doc.entries = body.entries as any;
    doc.stats.patternPlaced = body.entries.length;
    doc.validation.publishable = false;
    await doc.save();

    return ok({ patternPlaced: body.entries.length });
  } catch (e) {
    return handleError(e);
  }
}

/**
 * Re-expands the stored weekly pattern across the semester calendar.
 *
 * Pinned dated sessions and extra classes survive: pins are carried into the
 * expansion as immovable, and extra classes are re-attached afterwards. Then the
 * result is re-scored and re-validated so the review screen is truthful.
 */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    await connectAndRegister();
    const { id } = await params;

    const doc = await Timetable.findById(id);
    if (!doc) return fail("That timetable no longer exists.", 404);
    if (doc.status === "PUBLISHED") {
      return fail("This timetable is published. Move it back to draft before editing.", 409);
    }

    const u = await loadUniverse({ semesterId: doc.semester ? String(doc.semester) : undefined });
    if (u.teachingDays.length === 0) {
      return fail("This timetable has no semester calendar, so it cannot be expanded across dates.", 400);
    }
    if (doc.entries.length === 0) {
      return fail("There is no weekly pattern to expand yet.", 400);
    }

    const extras: DatedSession[] = (doc.sessions as any[])
      .filter((s) => (s.type ?? "REGULAR") === "EXTRA")
      .map((s) => ({
        date: s.date, day: s.day, slotOrder: s.slotOrder, duration: s.duration,
        sectionId: String(s.section), subjectId: String(s.subject),
        facultyId: String(s.faculty), roomId: String(s.room),
        kind: s.kind, type: "EXTRA" as const, locked: true, reason: s.reason,
      }));

    const expanded = expandToSemester({
      assignments: u.assignments,
      pattern: (doc.entries as any[]).map((e) => ({
        assignmentId: String(e.assignment),
        day: e.day,
        slotOrder: e.slotOrder,
        duration: e.duration,
        roomId: String(e.room),
        locked: !!e.locked,
      })),
      teachingDays: u.teachingDays,
      slots: u.slots,
      rooms: u.rooms,
      sections: u.sections,
      faculty: u.faculty,
      rules: u.rules,
      fixedSessions: extras,
    });

    const byId = new Map(u.raw.assignments.map((a: any) => [String(a._id), a]));
    const regular = expanded.sessions.map((s) => {
      const a = s.assignmentId ? (byId.get(s.assignmentId) as any) : null;
      return {
        assignment: a?._id,
        date: s.date, day: s.day, slotOrder: s.slotOrder, duration: s.duration,
        section: a?.section?._id ?? a?.section ?? s.sectionId,
        subject: a?.subject?._id ?? a?.subject ?? s.subjectId,
        faculty: a?.faculty?._id ?? a?.faculty ?? s.facultyId,
        room: s.roomId, kind: s.kind, type: s.type, locked: s.locked, reason: s.reason,
      };
    });

    const keptExtras = (doc.sessions as any[])
      .filter((s) => (s.type ?? "REGULAR") === "EXTRA")
      .map((s) => ({
        assignment: s.assignment, date: s.date, day: s.day, slotOrder: s.slotOrder,
        duration: s.duration, section: s.section, subject: s.subject, faculty: s.faculty,
        room: s.room, kind: s.kind, type: "EXTRA", locked: true, reason: s.reason,
      }));

    doc.sessions = [...regular, ...keptExtras] as any;

    const all: DatedSession[] = [
      ...expanded.sessions,
      ...extras,
    ];

    const audit = auditTimetable({
      sessions: all, assignments: u.assignments, teachingDays: u.teachingDays,
      slots: u.slots, rooms: u.rooms, sections: u.sections, faculty: u.faculty, rules: u.rules,
    });
    const score = scoreTimetable({
      sessions: all, assignments: u.assignments, teachingDays: u.teachingDays,
      slots: u.slots, sections: u.sections, faculty: u.faculty, rooms: u.rooms, rules: u.rules,
    });

    doc.stats.requested = u.assignments.reduce((n, a) => n + a.requiredSessions, 0);
    doc.stats.scheduled = expanded.sessions.filter((s) => s.type === "REGULAR").length;
    doc.stats.perAssignment = expanded.perAssignment.map((p) => ({
      assignment: p.assignmentId, label: p.label, required: p.required, scheduled: p.scheduled,
    })) as any;
    doc.stats.unscheduled = expanded.unscheduled as any;
    doc.stats.softScore = score.total;
    doc.stats.softBreakdown = score.breakdown as any;
    doc.stats.warnings = score.warnings;
    doc.stats.feasible = expanded.feasible && audit.publishable;
    doc.validation = {
      ranAt: new Date(),
      hardViolations: audit.hardViolations as any,
      softViolations: audit.softViolations as any,
      countMismatches: audit.countMismatches as any,
      publishable: audit.publishable,
    } as any;

    await doc.save();

    return ok({
      scheduled: doc.stats.scheduled,
      requested: doc.stats.requested,
      trimmed: expanded.trimmed,
      added: expanded.added,
      feasible: doc.stats.feasible,
      publishable: audit.publishable,
      unscheduled: expanded.unscheduled,
    });
  } catch (e) {
    return handleError(e);
  }
}
