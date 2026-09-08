import { connectAndRegister } from "@/lib/db";
import Timetable from "@/models/Timetable";
import { requireUniversityAdmin } from "@/lib/auth";
import { loadUniverse, solve, weeklyCellsFor, teachingWeekCount, type Session, type SolverInput } from "@/lib/scheduler";
import { ok, fail, handleError } from "@/lib/api";

/**
 * Places only the weekly-pattern cells that are still missing, treating
 * everything already on the canvas as immovable. This is what makes the builder
 * feel collaborative: an admin hand-places the awkward sessions, then asks the
 * solver to finish the rest.
 *
 * It works on the *pattern*, not the dated sessions — expanding the finished
 * pattern across the calendar is a separate, explicit step.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUniversityAdmin();
    await connectAndRegister();
    const { id } = await params;

    const doc = await Timetable.findOne({ _id: id, universityId: session.universityId });
    if (!doc) return fail("That timetable no longer exists.", 404);
    if (doc.status === "PUBLISHED") {
      return fail("This timetable is published. Move it back to draft before editing.", 409);
    }

    const u = await loadUniverse({ semesterId: doc.semester ? String(doc.semester) : undefined, universityId: session.universityId ?? undefined });
    if (u.assignments.length === 0) return fail("There are no active assignments to schedule.", 400);

    const weeks = u.teachingDays.length ? teachingWeekCount(u.teachingDays) : 14;
    const patternWeekdays = u.teachingDays.length
      ? [...new Set(u.teachingDays.map((d) => d.patternWeekday))].sort()
      : (u.settings?.workingDays ?? [1, 2, 3, 4, 5]);

    // How many pattern cells of each assignment are already on the canvas?
    const placedCount = new Map<string, number>();
    for (const e of doc.entries as any[]) {
      const k = String(e.assignment);
      placedCount.set(k, (placedCount.get(k) ?? 0) + 1);
    }

    const missing: Session[] = [];
    for (const a of u.assignments) {
      const want = weeklyCellsFor(a, weeks);
      const have = placedCount.get(a.id) ?? 0;
      for (let i = have; i < want; i++) {
        missing.push({
          key: `${a.id}#${i}`,
          assignmentId: a.id,
          sectionId: a.sectionId,
          subjectId: a.subjectId,
          subjectCode: a.subjectCode,
          facultyId: a.facultyId,
          kind: a.kind,
          duration: a.duration,
          occurrence: i,
          roomSelection: a.roomSelection,
          fixedRoom: a.fixedRoom,
          allowedRooms: a.allowedRooms,
          requiredRoomType: a.requiredRoomType,
          requiredCapabilities: a.requiredCapabilities,
        });
      }
    }

    if (missing.length === 0) {
      return ok({ added: 0, unplaced: [], message: "Every weekly slot is already filled." });
    }

    const input: SolverInput = {
      days: patternWeekdays,
      slots: u.slots,
      rooms: u.rooms,
      faculty: u.faculty,
      sections: u.sections,
      sessions: missing,
      schedulingRules: u.schedulingRules,
      seed: Date.now() % 100000,
      locked: (doc.entries as any[]).map((e) => ({
        sessionKey: String(e._id),
        day: e.day,
        slotOrder: e.slotOrder,
        duration: e.duration,
        roomId: String(e.room),
        sectionId: String(e.section),
        facultyId: String(e.faculty),
        assignmentId: String(e.assignment),
        subjectId: String(e.subject),
      })),
    };

    const result = solve(input);
    const byId = new Map(u.raw.assignments.map((a: any) => [String(a._id), a]));

    const added = Object.entries(result.placements).map(([key, p]) => {
      const a = byId.get(key.split("#")[0]) as any;
      return {
        assignment: a._id, day: p.day, slotOrder: p.slotOrder, duration: p.duration,
        section: a.section?._id ?? a.section,
        subject: a.subject?._id ?? a.subject,
        faculty: a.faculty?._id ?? a.faculty,
        room: p.roomId, kind: a.kind, locked: false,
      };
    });

    doc.entries.push(...(added as any[]));
    doc.stats.patternPlaced = doc.entries.length;
    doc.stats.unscheduled = result.unplaced.map((up) => ({ assignment: up.label, reason: up.reason })) as any;
    doc.validation.publishable = false;
    await doc.save();

    return ok({ added: added.length, unplaced: result.unplaced });
  } catch (e) {
    return handleError(e);
  }
}
