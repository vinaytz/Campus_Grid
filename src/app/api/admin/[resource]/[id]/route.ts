import { connectAndRegister } from "@/lib/db";
import { getResource } from "@/lib/resources";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, handleError, parseBody } from "@/lib/api";
import TimeSlot from "@/models/TimeSlot";

type Ctx = { params: Promise<{ resource: string; id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    await connectAndRegister();
    const { resource, id } = await params;
    const def = getResource(resource);

    const body = await parseBody(req, def.schema);
    if (resource === "slots") {
      const existing = await TimeSlot.find({ _id: { $ne: id } }).lean();
      const start = Number(body.start.replace(":", ""));
      const end = Number(body.end.replace(":", ""));
      const overlap = existing.find((slot) => {
        const a = Number(slot.start.replace(":", ""));
        const b = Number(slot.end.replace(":", ""));
        return start < b && end > a;
      });
      if (overlap) return fail(`Period overlaps with ${overlap.start}–${overlap.end}.`, 409);
    }
    const updated = await def.model.findByIdAndUpdate(id, body, {
      new: true, runValidators: true,
    });
    if (!updated) return fail("That record no longer exists.", 404);
    return ok(updated.toObject());
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    await connectAndRegister();
    const { resource, id } = await params;
    const def = getResource(resource);

    // Refuse deletes that would orphan dependent records.
    for (const g of def.guards ?? []) {
      const count = await g.model().countDocuments({ [g.field]: id });
      if (count > 0) {
        return fail(
          `Still used by ${count} ${g.label}. Remove those first, or mark this record inactive instead.`,
          409
        );
      }
    }

    const deleted = await def.model.findByIdAndDelete(id);
    if (!deleted) return fail("That record no longer exists.", 404);
    return ok({ id });
  } catch (e) {
    return handleError(e);
  }
}
