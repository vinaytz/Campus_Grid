import { connectAndRegister } from "@/lib/db";
import Timetable from "@/models/Timetable";
import Semester from "@/models/Semester";
import { requireAdmin } from "@/lib/auth";
import { revalidateTimetable, buildTeachingDays } from "@/lib/scheduler";
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
      .populate("entries.room", "code block capacity type capabilities")
      .populate("sessions.section", "number program strength")
      .populate("sessions.subject", "code name")
      .populate("sessions.faculty", "name facultyId")
      .populate("sessions.room", "code block capacity type capabilities")
      .lean();

    if (!doc) return fail("That timetable no longer exists.", 404);

    // The calendar goes with the timetable — the semester view needs the list of
    // teaching days to render weeks and to know which dates are legal targets.
    let teachingDays: unknown[] = [];
    if ((doc as any).semester) {
      const sem = await Semester.findById((doc as any).semester).lean();
      if (sem) {
        teachingDays = buildTeachingDays({
          startDate: sem.startDate,
          endDate: sem.endDate,
          teachingWeekdays: sem.teachingWeekdays ?? [1, 2, 3, 4, 5],
          exceptions: sem.exceptions ?? [],
        });
        (doc as any).semesterDoc = sem;
      }
    }

    return ok({ ...(doc as any), teachingDays });
  } catch (e) {
    return handleError(e);
  }
}

/**
 * Renames, or changes status.
 *
 * Publishing is gated: the independent validator re-runs against the stored
 * sessions here, and a timetable with any hard violation or session-count
 * mismatch is refused. The UI's own opinion is never trusted.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    await connectAndRegister();
    const { id } = await params;
    const { status, name } = await req.json();

    const doc = await Timetable.findById(id);
    if (!doc) return fail("That timetable no longer exists.", 404);

    if (status === "PUBLISHED") {
      const { audit, score } = await revalidateTimetable(doc);

      doc.validation = {
        ranAt: new Date(),
        hardViolations: audit.hardViolations as any,
        softViolations: audit.softViolations as any,
        countMismatches: audit.countMismatches as any,
        publishable: audit.publishable,
      } as any;
      doc.stats.softScore = score.total;
      doc.stats.softBreakdown = score.breakdown as any;
      doc.stats.warnings = score.warnings;

      if (!audit.publishable) {
        await doc.save();
        const headline =
          audit.hardViolations.length > 0
            ? `${audit.hardViolations.length} hard constraint violation(s) must be fixed first.`
            : `${audit.countMismatches.length} assignment(s) do not have their exact required number of sessions.`;
        return fail(headline, 409, {
          hardViolations: audit.hardViolations.slice(0, 20),
          countMismatches: audit.countMismatches.slice(0, 20),
        });
      }

      // Publishing is exclusive: one live timetable at a time.
      await Timetable.updateMany({ status: "PUBLISHED", _id: { $ne: doc._id } }, { status: "ARCHIVED" });
      doc.status = "PUBLISHED";
      if (name) doc.name = name;
      await doc.save();
      return ok({ _id: String(doc._id), name: doc.name, status: doc.status });
    }

    if (status) doc.status = status;
    if (name) doc.name = name;
    await doc.save();

    return ok({ _id: String(doc._id), name: doc.name, status: doc.status });
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
