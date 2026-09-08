import { connectAndRegister } from "@/lib/db";
import Timetable from "@/models/Timetable";
import { requireAdmin } from "@/lib/auth";
import { moveSessionSchema, extraSessionSchema } from "@/lib/validators";
import { loadUniverse, validateMove, weekdayOf, type DatedSession } from "@/lib/scheduler";
import { ok, fail, handleError, parseBody } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

/** Shapes the stored subdocuments into what the move validator expects. */
function toDated(sessions: any[]): (DatedSession & { id: string })[] {
  return sessions.map((s) => ({
    id: String(s._id),
    assignmentId: s.assignment ? String(s.assignment) : undefined,
    date: s.date,
    day: s.day,
    slotOrder: s.slotOrder,
    duration: s.duration,
    sectionId: String(s.section),
    subjectId: String(s.subject),
    facultyId: String(s.faculty),
    roomId: String(s.room),
    kind: s.kind,
    type: s.type ?? "REGULAR",
    locked: !!s.locked,
    reason: s.reason,
  }));
}

/**
 * Moves one dated session.
 *
 * Every hard constraint is rechecked server-side against the timetable's own
 * sessions. A move that would break one is rejected with every reason it broke,
 * and nothing is written.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    await connectAndRegister();
    const { id } = await params;
    const body = await parseBody(req, moveSessionSchema);

    const doc = await Timetable.findById(id);
    if (!doc) return fail("That timetable no longer exists.", 404);
    if (String(doc.status) === "PUBLISHED") {
      return fail("This timetable is published. Move it back to draft before editing.", 409);
    }
    if (String(doc.status) === "PUBLISHED") {
      return fail("This timetable is published. Move it back to draft before editing.", 409);
    }

    const session = doc.sessions.id(body.sessionId);
    if (!session) return fail("That session is no longer on this timetable.", 404);

    const u = await loadUniverse({ semesterId: doc.semester ? String(doc.semester) : undefined });

    const verdict = validateMove(
      {
        sessionId: body.sessionId,
        date: body.date,
        slotOrder: Number(body.slotOrder),
        duration: session.duration,
        sectionId: String(session.section),
        facultyId: String(session.faculty),
        roomId: String(body.room ?? session.room),
        kind: session.kind,
        type: session.type ?? "REGULAR",
        assignmentId: session.assignment ? String(session.assignment) : undefined,
      },
      {
        sessions: toDated(doc.sessions as any[]),
        assignments: u.assignments,
        teachingDays: u.teachingDays,
        slots: u.slots,
        rooms: u.rooms,
        sections: u.sections,
        faculty: u.faculty,
        rules: u.rules,
      }
    );

    if (!verdict.ok) return fail(verdict.reasons[0], 409, { reasons: verdict.reasons });

    session.date = body.date;
    session.day = weekdayOf(body.date);
    session.slotOrder = body.slotOrder;
    if (body.room) session.room = body.room as any;
    session.locked = true; // a hand-placed session survives re-expansion
    doc.validation.publishable = false; // stale until revalidated
    await doc.save();

    return ok({ moved: body.sessionId });
  } catch (e) {
    return handleError(e);
  }
}

/**
 * Adds an ad-hoc extra class.
 *
 * Extra classes are schedule exceptions: they occupy a room, a faculty member and
 * a section like any other class and are fully hard-constraint checked, but they
 * are stored as type EXTRA and never count towards an assignment's
 * requiredSessions.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    await connectAndRegister();
    const { id } = await params;
    const body = await parseBody(req, extraSessionSchema);

    const doc = await Timetable.findById(id);
    if (!doc) return fail("That timetable no longer exists.", 404);
    if (doc.status === "PUBLISHED") {
      return fail("This timetable is published. Move it back to draft before editing.", 409);
    }

    const u = await loadUniverse({ semesterId: doc.semester ? String(doc.semester) : undefined });

    const verdict = validateMove(
      {
        date: body.date,
        slotOrder: body.slotOrder,
        duration: Number(body.duration || 1),
        sectionId: body.section,
        facultyId: body.faculty,
        roomId: body.room,
        kind: body.kind ?? "LECTURE",
        type: "EXTRA",
      },
      {
        sessions: toDated(doc.sessions as any[]),
        assignments: u.assignments,
        teachingDays: u.teachingDays,
        slots: u.slots,
        rooms: u.rooms,
        sections: u.sections,
        faculty: u.faculty,
        rules: u.rules,
      }
    );

    if (!verdict.ok) return fail(verdict.reasons[0], 409, { reasons: verdict.reasons });

    doc.sessions.push({
      date: body.date,
      day: weekdayOf(body.date),
      slotOrder: body.slotOrder,
      duration: body.duration,
      section: body.section,
      subject: body.subject,
      faculty: body.faculty,
      room: body.room,
      kind: body.kind,
      type: "EXTRA",
      locked: true,
      reason: body.reason,
    } as any);

    await doc.save();
    return ok({ added: 1 }, 201);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    await connectAndRegister();
    const { id } = await params;
    const { sessionId } = await req.json();

    const doc = await Timetable.findById(id);
    if (!doc) return fail("That timetable no longer exists.", 404);
    if (String(doc.status) === "PUBLISHED") {
      return fail("This timetable is published. Move it back to draft before editing.", 409);
    }

    const session = doc.sessions.id(sessionId);
    if (!session) return fail("That session is no longer on this timetable.", 404);

    const wasRegular = (session.type ?? "REGULAR") === "REGULAR";
    doc.sessions.pull({ _id: sessionId });
    if (wasRegular) {
      // Removing a regular session breaks the exact count, so publishing must be
      // re-earned rather than silently kept.
      doc.validation.publishable = false;
      doc.stats.scheduled = (doc.sessions as any[]).filter((s) => s.type === "REGULAR").length;
    }
    await doc.save();

    return ok({ removed: sessionId, regular: wasRegular });
  } catch (e) {
    return handleError(e);
  }
}
