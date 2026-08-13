import { connectAndRegister } from "@/lib/db";
import Timetable from "@/models/Timetable";
import { requireAdmin } from "@/lib/auth";
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

/**
 * Replaces the whole layout in one write.
 *
 * The Studio is the source of truth while an admin is working — it holds the
 * layout locally, validates every move against the same rules the solver uses,
 * and saves the result. Replacing wholesale keeps undo/redo trivially correct:
 * a snapshot is just an array.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    await connectAndRegister();
    const { id } = await params;
    const body = layoutSchema.parse(await req.json());

    const doc = await Timetable.findById(id);
    if (!doc) return fail("That timetable no longer exists.", 404);

    doc.entries = body.entries as any;
    doc.stats.placed = body.entries.length;
    await doc.save();

    return ok({ placed: body.entries.length });
  } catch (e) {
    return handleError(e);
  }
}
