import { connectAndRegister } from "@/lib/db";
import Timetable from "@/models/Timetable";
import TimeSlot from "@/models/TimeSlot";
import Settings from "@/models/Settings";
import Semester from "@/models/Semester";
import Section from "@/models/Section";
import Faculty from "@/models/Faculty";
import Room from "@/models/Room";
import University from "@/models/University";
import { ok, handleError } from "@/lib/api";

export const revalidate = 60;

/**
 * The only unauthenticated read. Serves the published timetable filtered by one
 * of section / faculty / room.
 *
 * Two shapes come back: `entries` is the typical week (the recurring pattern),
 * and `sessions` are the real dated classes. A `from`/`to` range narrows the
 * dated list so the board never ships a whole semester to render one week.
 */
export async function GET(req: Request) {
  try {
    await connectAndRegister();
    const { searchParams } = new URL(req.url);
    const view = searchParams.get("view") ?? "section";
    const id = searchParams.get("id");
    const universityCode = searchParams.get("university");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const university = await University.findOne(
      universityCode ? { code: universityCode.toUpperCase(), active: true } : { active: true }
    ).sort({ name: 1 }).lean();
    const universityId = university?._id;
    const [settings, slots, timetable] = await Promise.all([
      Settings.findOne({ universityId }).lean(),
      TimeSlot.find({ universityId, active: true }).sort({ order: 1 }).lean(),
      Timetable.findOne({ universityId, status: "PUBLISHED" })
        .populate("entries.section", "number program strength")
        .populate("entries.subject", "code name")
        .populate("entries.faculty", "name facultyId department")
        .populate("entries.room", "code block capacity type")
        .populate("sessions.section", "number program strength")
        .populate("sessions.subject", "code name")
        .populate("sessions.faculty", "name facultyId department")
        .populate("sessions.room", "code block capacity type")
        .lean(),
    ]);

    const [sections, faculty, rooms] = await Promise.all([
      Section.find({ universityId, active: true }).select("number program semester").sort({ number: 1 }).lean(),
      Faculty.find({ universityId, active: true }).select("name facultyId department").sort({ name: 1 }).lean(),
      Room.find({ universityId, active: true }).select("code block type").sort({ block: 1, code: 1 }).lean(),
    ]);

    const directory = { sections, faculty, rooms };

    if (!timetable) {
      return ok({
        published: false, settings, slots, directory,
        entries: [], sessions: [], semester: null, meta: null,
      });
    }

    const tt = timetable as any;
    const semester = tt.semester ? await Semester.findOne({ _id: tt.semester, universityId }).lean() : null;

    const field = view === "faculty" ? "faculty" : view === "room" ? "room" : "section";

    let entries = tt.entries ?? [];
    let sessions = tt.sessions ?? [];

    if (id) {
      entries = entries.filter((e: any) => String(e[field]?._id) === id);
      sessions = sessions.filter((s: any) => String(s[field]?._id) === id);
    }
    if (from) sessions = sessions.filter((s: any) => s.date >= from);
    if (to) sessions = sessions.filter((s: any) => s.date <= to);

    sessions = [...sessions].sort(
      (a: any, b: any) => String(a.date).localeCompare(String(b.date)) || a.slotOrder - b.slotOrder
    );

    return ok({
      published: true,
      settings,
      slots,
      directory,
      entries,
      sessions,
      semester: semester
        ? {
            name: semester.name,
            startDate: semester.startDate,
            endDate: semester.endDate,
            teachingWeekdays: semester.teachingWeekdays,
          }
        : null,
      meta: {
        name: tt.name,
        academicYear: tt.academicYear,
        term: tt.term,
        updatedAt: tt.updatedAt,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
