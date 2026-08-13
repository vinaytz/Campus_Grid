import { connectAndRegister } from "@/lib/db";
import Timetable from "@/models/Timetable";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    await connectAndRegister();
    const { id } = await params;

    const doc = await Timetable.findById(id)
      .populate("entries.section", "number program strength")
      .populate("entries.subject", "code name")
      .populate("entries.faculty", "name facultyId")
      .populate("entries.room", "code block capacity type")
      .lean();

    if (!doc) return fail("That timetable no longer exists.", 404);
    return ok(doc);
  } catch (e) {
    return handleError(e);
  }
}

/** Publishing is exclusive: one live timetable at a time. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    await connectAndRegister();
    const { id } = await params;
    const { status, name } = await req.json();

    if (status === "PUBLISHED") {
      await Timetable.updateMany({ status: "PUBLISHED" }, { status: "ARCHIVED" });
    }
    const update: Record<string, unknown> = {};
    if (status) update.status = status;
    if (name) update.name = name;

    const doc = await Timetable.findByIdAndUpdate(id, update, { new: true })
      .select("name status")
      .lean();
    if (!doc) return fail("That timetable no longer exists.", 404);
    return ok(doc);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    await connectAndRegister();
    const { id } = await params;
    await Timetable.findByIdAndDelete(id);
    return ok({ id });
  } catch (e) {
    return handleError(e);
  }
}
