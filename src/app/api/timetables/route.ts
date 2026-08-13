import { connectAndRegister } from "@/lib/db";
import Timetable from "@/models/Timetable";
import Settings from "@/models/Settings";
import { requireAdmin } from "@/lib/auth";
import { generateSchema } from "@/lib/validators";
import { generateTimetable } from "@/lib/scheduler";
import { ok, handleError, parseBody } from "@/lib/api";

export async function GET() {
  try {
    await requireAdmin();
    await connectAndRegister();
    const list = await Timetable.find()
      .select("name academicYear term status stats createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .lean();
    return ok(list);
  } catch (e) {
    return handleError(e);
  }
}

/** Creating a timetable *is* running the solver — there is no empty draft state. */
export async function POST(req: Request) {
  try {
    await requireAdmin();
    await connectAndRegister();
    const body = await parseBody(req, generateSchema);

    const settings = await Settings.findOne().lean();

    // An empty sheet is a valid starting point — the admin fills it on the canvas.
    if (body.empty) {
      const blank = await Timetable.create({
        name: body.name,
        academicYear: settings?.academicYear ?? "2025-26",
        term: settings?.term ?? "Odd",
        status: "DRAFT",
        entries: [],
        stats: { requested: 0, placed: 0, unplaced: [], generatedAt: new Date() },
      });
      return ok({ id: String(blank._id), stats: blank.stats }, 201);
    }

    const { entries, result } = await generateTimetable({
      sections: body.sections,
      seed: body.seed ?? Date.now() % 100000,
    });
    const doc = await Timetable.create({
      name: body.name,
      academicYear: settings?.academicYear ?? "2025-26",
      term: settings?.term ?? "Odd",
      status: "DRAFT",
      entries,
      stats: {
        requested: result.stats.requested,
        placed: result.stats.placed,
        unplaced: result.unplaced.map((u) => ({ assignment: u.label, reason: u.reason })),
        generatedAt: new Date(),
        durationMs: result.stats.durationMs,
      },
    });

    return ok({ id: String(doc._id), stats: doc.stats }, 201);
  } catch (e) {
    return handleError(e);
  }
}
