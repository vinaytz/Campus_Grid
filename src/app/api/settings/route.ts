import { connectDB } from "@/lib/db";
import Settings from "@/models/Settings";
import { requireUniversityAdmin } from "@/lib/auth";
import { settingsSchema } from "@/lib/validators";
import { ok, handleError, parseBody } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireUniversityAdmin();
    await connectDB();
    const doc = (await Settings.findOne({ universityId: session.universityId }).lean()) ??
      (await Settings.create({ universityId: session.universityId })).toObject();
    return ok(doc);
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requireUniversityAdmin();
    await connectDB();
    const body = await parseBody(req, settingsSchema);
    const doc = await Settings.findOneAndUpdate(
      { universityId: session.universityId },
      { ...body, universityId: session.universityId },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return ok(doc.toObject());
  } catch (e) {
    return handleError(e);
  }
}
