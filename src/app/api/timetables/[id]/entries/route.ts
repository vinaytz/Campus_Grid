import { connectAndRegister } from "@/lib/db";
import Timetable from "@/models/Timetable";
import { requireAdmin } from "@/lib/auth";
import { moveEntrySchema } from "@/lib/validators";
import { loadUniverse, validatePattern } from "@/lib/scheduler";
import { ok, fail, handleError, parseBody } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Moves one cell of the weekly pattern.
 *
 * Validation applies the move to a copy of the pattern and checks the *whole
 * result*, rather than reasoning about the single cell in isolation — that way a
 * move can't pass by accident because the check forgot to consider some other
 * cell it now collides with.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    await connectAndRegister();
    const { id } = await params;
    const body = await parseBody(req, moveEntrySchema);

    const doc = await Timetable.findById(id);
    if (!doc) return fail("That timetable no longer exists.", 404);
    if (doc.status === "PUBLISHED") {
      return fail("This timetable is published. Move it back to draft before editing.", 409);
    }

    const entry = doc.entries.id(body.entryId);
    if (!entry) return fail("That session is no longer on this timetable.", 404);

    const u = await loadUniverse({ semesterId: doc.semester ? String(doc.semester) : undefined });
    const patternWeekdays = u.teachingDays.length
      ? [...new Set(u.teachingDays.map((d) => d.patternWeekday))].sort()
      : (u.settings?.workingDays ?? [1, 2, 3, 4, 5]);

    const proposed = (doc.entries as any[]).map((e) => {
      const isMoved = String(e._id) === body.entryId;
      return {
        assignmentId: String(e.assignment),
        day: isMoved ? body.day : e.day,
        slotOrder: isMoved ? body.slotOrder : e.slotOrder,
        duration: e.duration,
        roomId: isMoved ? String(body.room ?? e.room) : String(e.room),
      };
    });

    const verdict = validatePattern(proposed, {
      assignments: u.assignments,
      slots: u.slots,
      rooms: u.rooms,
      sections: u.sections,
      faculty: u.faculty,
      rules: u.rules,
      days: patternWeekdays,
    });

    if (!verdict.ok) return fail(verdict.reasons[0], 409, { conflicts: verdict.reasons });

    entry.day = body.day;
    entry.slotOrder = body.slotOrder;
    if (body.room) entry.room = body.room as any;
    entry.locked = true;
    doc.validation.publishable = false;
    await doc.save();

    return ok({ moved: body.entryId });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    await connectAndRegister();
    const { id } = await params;
    const { entryId } = await req.json();

    const doc = await Timetable.findById(id);
    if (!doc) return fail("That timetable no longer exists.", 404);
    doc.entries.pull({ _id: entryId });
    doc.stats.patternPlaced = doc.entries.length;
    doc.validation.publishable = false;
    await doc.save();
    return ok({ removed: entryId });
  } catch (e) {
    return handleError(e);
  }
}
