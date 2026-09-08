import { connectAndRegister } from "@/lib/db";
import Timetable from "@/models/Timetable";
import Settings from "@/models/Settings";
import Semester from "@/models/Semester";
import { requireAdmin } from "@/lib/auth";
import { generateSchema } from "@/lib/validators";
import { generateTimetable } from "@/lib/scheduler";
import { ok, handleError, parseBody } from "@/lib/api";

export async function GET() {
  try {
    await requireAdmin();
    await connectAndRegister();
    const list = await Timetable.find()
      .select("name academicYear term status stats validation semester createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .lean();
    return ok(list);
  } catch (e) {
    return handleError(e);
  }
}

/**
 * Runs the full generation pipeline and stores the draft.
 *
 * The response carries the generation report the review screen needs —
 * requested vs scheduled, hard violations, soft score, warnings and the
 * assignments that could not be satisfied.
 */
export async function POST(req: Request) {
  try {
    await requireAdmin();
    await connectAndRegister();
    const body = await parseBody(req, generateSchema);

    const settings = await Settings.findOne().lean();

    // An empty sheet is a valid starting point — the admin fills it on the canvas.
    if (body.empty) {
      const semester = body.semester
        ? await Semester.findById(body.semester).lean()
        : await Semester.findOne({ active: true }).sort({ updatedAt: -1 }).lean();
      const blank = await Timetable.create({
        name: body.name,
        semester: semester?._id,
        academicYear: semester?.academicYear ?? settings?.academicYear ?? "2025-26",
        term: semester?.term ?? settings?.term ?? "Odd",
        status: "DRAFT",
        entries: [],
        sessions: [],
        stats: { requested: 0, scheduled: 0, patternPlaced: 0, generatedAt: new Date(), feasible: false },
        validation: { publishable: false },
      });
      return ok({ id: String(blank._id), stats: blank.stats }, 201);
    }

    const out = await generateTimetable({
      sections: body.sections,
      semesterId: body.semester,
      seed: body.seed ?? Date.now() % 100000,
    });

    const doc = await Timetable.create({
      name: body.name,
      semester: out.universe.semester?._id,
      academicYear: out.universe.semester?.academicYear ?? settings?.academicYear ?? "2025-26",
      term: out.universe.semester?.term ?? settings?.term ?? "Odd",
      status: "DRAFT",
      entries: out.entries,
      sessions: out.sessions,
      stats: {
        ...out.stats,
        generatedAt: new Date(),
      },
      validation: {
        ranAt: new Date(),
        hardViolations: out.audit.hardViolations,
        softViolations: out.audit.softViolations,
        countMismatches: out.audit.countMismatches,
        publishable: out.audit.publishable,
      },
    });

    return ok({
      id: String(doc._id),
      stats: doc.stats,
      validation: doc.validation,
    }, 201);
  } catch (e) {
    return handleError(e);
  }
}
