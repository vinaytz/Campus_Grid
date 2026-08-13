import { connectAndRegister } from "@/lib/db";
import Timetable from "@/models/Timetable";
import TimeSlot from "@/models/TimeSlot";
import Settings from "@/models/Settings";
import Section from "@/models/Section";
import Faculty from "@/models/Faculty";
import Room from "@/models/Room";
import { ok, handleError } from "@/lib/api";

export const revalidate = 60;

/**
 * The only unauthenticated read. Serves the published timetable filtered by
 * one of section / faculty / room, plus the pickers the board needs.
 */
export async function GET(req: Request) {
  try {
    await connectAndRegister();
    const { searchParams } = new URL(req.url);
    const view = searchParams.get("view") ?? "section";
    const id = searchParams.get("id");

    const [settings, slots, timetable] = await Promise.all([
      Settings.findOne().lean(),
      TimeSlot.find({ active: true }).sort({ order: 1 }).lean(),
      Timetable.findOne({ status: "PUBLISHED" })
        .populate("entries.section", "number program strength")
        .populate("entries.subject", "code name")
        .populate("entries.faculty", "name facultyId department")
        .populate("entries.room", "code block capacity type")
        .lean(),
    ]);

    const [sections, faculty, rooms] = await Promise.all([
      Section.find({ active: true }).select("number program semester").sort({ number: 1 }).lean(),
      Faculty.find({ active: true }).select("name facultyId department").sort({ name: 1 }).lean(),
      Room.find({ active: true }).select("code block type").sort({ block: 1, code: 1 }).lean(),
    ]);

    const directory = { sections, faculty, rooms };

    if (!timetable) {
      return ok({
        published: false, settings, slots, directory, entries: [], meta: null,
      });
    }

    let entries = (timetable as any).entries ?? [];
    if (id) {
      const field = view === "faculty" ? "faculty" : view === "room" ? "room" : "section";
      entries = entries.filter((e: any) => String(e[field]?._id) === id);
    }

    return ok({
      published: true,
      settings,
      slots,
      directory,
      entries,
      meta: {
        name: (timetable as any).name,
        academicYear: (timetable as any).academicYear,
        term: (timetable as any).term,
        updatedAt: (timetable as any).updatedAt,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
