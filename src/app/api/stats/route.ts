import { connectAndRegister } from "@/lib/db";
import Faculty from "@/models/Faculty";
import Subject from "@/models/Subject";
import Room from "@/models/Room";
import Section from "@/models/Section";
import Assignment from "@/models/Assignment";
import Timetable from "@/models/Timetable";
import TimeSlot from "@/models/TimeSlot";
import Semester from "@/models/Semester";
import { requireAdmin } from "@/lib/auth";
import { buildTeachingDays, teachingWeekCount } from "@/lib/scheduler";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    await requireAdmin();
    await connectAndRegister();

    const [faculty, subjects, rooms, sections, assignments, slots, published, latest, semester] =
      await Promise.all([
        Faculty.countDocuments({ active: true }),
        Subject.countDocuments({ active: true }),
        Room.countDocuments({ active: true }),
        Section.countDocuments({ active: true }),
        Assignment.find({ active: true }).lean(),
        TimeSlot.countDocuments({ active: true, kind: "CLASS" }),
        Timetable.countDocuments({ status: "PUBLISHED" }),
        Timetable.findOne().sort({ updatedAt: -1 })
          .select("name status stats validation updatedAt").lean(),
        Semester.findOne({ active: true }).sort({ updatedAt: -1 }).lean(),
      ]);

    // Semester demand vs supply, which is what actually decides feasibility.
    const semesterSessions = assignments.reduce((n: number, a: any) => n + (a.requiredSessions ?? 0), 0);
    const semesterPeriods = assignments.reduce(
      (n: number, a: any) => n + (a.requiredSessions ?? 0) * (a.duration ?? 1), 0
    );

    let teachingDays = 0;
    let weeks = 0;
    if (semester) {
      const days = buildTeachingDays({
        startDate: semester.startDate,
        endDate: semester.endDate,
        teachingWeekdays: semester.teachingWeekdays ?? [1, 2, 3, 4, 5],
        exceptions: semester.exceptions ?? [],
      });
      teachingDays = days.length;
      weeks = teachingWeekCount(days);
    }

    return ok({
      faculty, subjects, rooms, sections,
      assignments: assignments.length,
      semesterSessions,
      semesterPeriods,
      /** Room-periods available across the whole semester. */
      capacity: teachingDays * slots * rooms,
      slots,
      teachingDays,
      weeks,
      semester: semester
        ? { _id: String(semester._id), name: semester.name, startDate: semester.startDate, endDate: semester.endDate }
        : null,
      published,
      latest,
    });
  } catch (e) {
    return handleError(e);
  }
}
