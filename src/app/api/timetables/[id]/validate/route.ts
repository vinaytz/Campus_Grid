import { connectAndRegister } from "@/lib/db";
import Timetable from "@/models/Timetable";
import { requireAdmin } from "@/lib/auth";
import { revalidateTimetable } from "@/lib/scheduler";
import { ok, fail, handleError } from "@/lib/api";

/**
 * Runs the independent validator over the stored sessions and records the result.
 *
 * Separate from generation on purpose: an admin edits, revalidates, and only then
 * publishes. The same code path backs the publish gate, so "Validate" tells the
 * truth about whether Publish will succeed.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    await connectAndRegister();
    const { id } = await params;

    const doc = await Timetable.findById(id);
    if (!doc) return fail("That timetable no longer exists.", 404);

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
    doc.stats.scheduled = (doc.sessions as any[]).filter((s) => s.type === "REGULAR").length;
    await doc.save();

    return ok({
      publishable: audit.publishable,
      hardViolations: audit.hardViolations,
      softViolations: audit.softViolations,
      countMismatches: audit.countMismatches,
      softScore: score.total,
      softBreakdown: score.breakdown,
      warnings: score.warnings,
      scheduled: doc.stats.scheduled,
    });
  } catch (e) {
    return handleError(e);
  }
}
