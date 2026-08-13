import { connectAndRegister } from "@/lib/db";
import Faculty from "@/models/Faculty";
import Subject from "@/models/Subject";
import Room from "@/models/Room";
import Section from "@/models/Section";
import Assignment from "@/models/Assignment";
import Timetable from "@/models/Timetable";
import TimeSlot from "@/models/TimeSlot";
import { requireAdmin } from "@/lib/auth";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    await requireAdmin();
    await connectAndRegister();

    const [faculty, subjects, rooms, sections, assignments, slots, published, latest] =
      await Promise.all([
        Faculty.countDocuments({ active: true }),
        Subject.countDocuments({ active: true }),
        Room.countDocuments({ active: true }),
        Section.countDocuments({ active: true }),
        Assignment.find({ active: true }).lean(),
        TimeSlot.countDocuments({ active: true, kind: "CLASS" }),
        Timetable.countDocuments({ status: "PUBLISHED" }),
        Timetable.findOne().sort({ updatedAt: -1 }).select("name status stats updatedAt").lean(),
      ]);

    const weeklySessions = assignments.reduce(
      (n: number, a: any) => n + a.sessionsPerWeek * a.duration, 0
    );
    const seatCapacity = slots * rooms; // teachable room-periods per day

    return ok({
      faculty, subjects, rooms, sections,
      assignments: assignments.length,
      weeklySessions,
      seatCapacity,
      published,
      latest,
    });
  } catch (e) {
    return handleError(e);
  }
}
