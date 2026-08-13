import { connectAndRegister } from "@/lib/db";
import Timetable from "@/models/Timetable";
import { requireAdmin } from "@/lib/auth";
import { moveEntrySchema } from "@/lib/validators";
import { findConflicts } from "@/lib/scheduler";
import { ok, fail, handleError, parseBody } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

/** Manual move — validated against the same hard rules as generation. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    await connectAndRegister();
    const { id } = await params;
    const body = await parseBody(req, moveEntrySchema);

    const doc = await Timetable.findById(id)
      .populate("entries.subject", "code")
      .populate("entries.faculty", "name");
    if (!doc) return fail("That timetable no longer exists.", 404);

    const entry = doc.entries.id(body.entryId);
    if (!entry) return fail("That session is no longer on this timetable.", 404);

    const conflicts = findConflicts(doc.entries, {
      id: body.entryId,
      day: body.day,
      slotOrder: body.slotOrder,
      duration: entry.duration,
      room: String(body.room ?? entry.room),
      section: String(entry.section),
      faculty: String(entry.faculty),
    });

    if (conflicts.length) return fail(conflicts[0], 409, { conflicts });

    entry.day = body.day;
    entry.slotOrder = body.slotOrder;
    if (body.room) entry.room = body.room as any;
    entry.locked = true;
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
    await doc.save();
    return ok({ removed: entryId });
  } catch (e) {
    return handleError(e);
  }
}
