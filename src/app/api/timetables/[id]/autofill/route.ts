import { connectAndRegister } from "@/lib/db";
import Timetable from "@/models/Timetable";
import Assignment from "@/models/Assignment";
import { requireAdmin } from "@/lib/auth";
import { buildSolverInput, solve } from "@/lib/scheduler";
import { ok, fail, handleError } from "@/lib/api";

/**
 * Places only what is still missing, treating everything already on the canvas
 * as immovable. This is what makes the builder feel collaborative: an admin
 * hand-places the awkward sessions, then asks the solver to finish the rest.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    await connectAndRegister();
    const { id } = await params;

    const doc = await Timetable.findById(id);
    if (!doc) return fail("That timetable no longer exists.", 404);

    const { input } = await buildSolverInput({});
    const assignments = await Assignment.find({ active: true }).lean();
    const byId = new Map(assignments.map((a: any) => [String(a._id), a]));

    // How many sessions of each assignment are already on the canvas?
    const placedCount = new Map<string, number>();
    for (const e of doc.entries as any[]) {
      const k = String(e.assignment);
      placedCount.set(k, (placedCount.get(k) ?? 0) + 1);
    }

    // Keep only the surplus sessions the canvas is still missing.
    const seen = new Map<string, number>();
    const missing = input.sessions.filter((s) => {
      const already = placedCount.get(s.assignmentId) ?? 0;
      const n = seen.get(s.assignmentId) ?? 0;
      seen.set(s.assignmentId, n + 1);
      return n >= already;
    });

    if (missing.length === 0) {
      return ok({ added: 0, unplaced: [], message: "Everything is already placed." });
    }

    const result = solve({
      ...input,
      sessions: missing,
      locked: (doc.entries as any[]).map((e) => ({
        sessionKey: String(e._id),
        day: e.day,
        slotOrder: e.slotOrder,
        duration: e.duration,
        roomId: String(e.room),
        sectionId: String(e.section),
        facultyId: String(e.faculty),
      })),
      seed: Date.now() % 100000,
    });

    const added = Object.entries(result.placements).map(([key, p]) => {
      const a = byId.get(key.split("#")[0]) as any;
      return {
        assignment: a._id, day: p.day, slotOrder: p.slotOrder, duration: p.duration,
        section: a.section, subject: a.subject, faculty: a.faculty,
        room: p.roomId, kind: a.kind, locked: false,
      };
    });

    doc.entries.push(...(added as any[]));
    doc.stats.placed = doc.entries.length;
    doc.stats.unplaced = result.unplaced.map((u) => ({ assignment: u.label, reason: u.reason }));
    await doc.save();

    return ok({ added: added.length, unplaced: result.unplaced });
  } catch (e) {
    return handleError(e);
  }
}
