import { connectAndRegister } from "@/lib/db";
import University from "@/models/University";
import { requirePlatformAdmin } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin();
    await connectAndRegister();
    const { id } = await params;
    const body = await req.json() as { active?: boolean; name?: string };
    const doc = await University.findByIdAndUpdate(id, { $set: body }, { new: true, runValidators: true });
    if (!doc) return fail("University not found.", 404);
    return ok(doc.toObject());
  } catch (e) { return handleError(e); }
}
