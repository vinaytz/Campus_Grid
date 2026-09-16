import { connectAndRegister } from "@/lib/db";
import Timetable from "@/models/Timetable";
import TimeSlot from "@/models/TimeSlot";
import Settings from "@/models/Settings";
import Semester from "@/models/Semester";
import Section from "@/models/Section";
import Faculty from "@/models/Faculty";
import Room from "@/models/Room";
import University from "@/models/University";
import { isValidObjectId } from "mongoose";
import { ok, fail, handleError } from "@/lib/api";
import { addDays, buildTeachingDays, daysBetween, weekdayOf } from "@/lib/scheduler/calendar";

export const revalidate = 60;
export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One teaching week of the semester, numbered the same way as the admin
 * semester view: 7-day blocks counted from the first teaching day. Uses `week`
 * when given, otherwise the week containing `date`, clamped to the semester.
 */
function resolveWeek(semester: any, weekParam: string | null, dateParam: string | null) {
  if (!semester) return null;
  try {
    const weekdays: number[] = semester.teachingWeekdays ?? [1, 2, 3, 4, 5];
    const exceptions: any[] = semester.exceptions ?? [];
    const teachingDays = buildTeachingDays({
      startDate: semester.startDate, endDate: semester.endDate, teachingWeekdays: weekdays, exceptions,
    });
    if (teachingDays.length === 0) return null;

    const anchor = teachingDays[0].date;
    const weeks = teachingDays[teachingDays.length - 1].week;
    let week = Number(weekParam);
    if (!weekParam || !Number.isInteger(week)) {
      week = 1;
      if (dateParam && ISO_DATE.test(dateParam)) {
        try { week = Math.floor(daysBetween(anchor, dateParam) / 7) + 1; } catch { /* not a real date */ }
      }
    }
    week = Math.min(weeks, Math.max(1, week));

    const start = addDays(anchor, 7 * (week - 1));
    const end = addDays(start, 6);
    const teaching = new Set(teachingDays.map((d) => d.date));
    const days: { date: string; weekday: number; teaching: boolean; note?: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(start, i);
      const weekday = weekdayOf(date);
      const isTeaching = teaching.has(date);
      if (!isTeaching && !weekdays.includes(weekday)) continue;
      let note: string | undefined;
      if (!isTeaching) {
        const blocked = exceptions.find((ex) =>
          ex.kind !== "SPECIAL_WORKING" && ex.date <= date && date <= (ex.endDate || ex.date));
        note = blocked?.label
          ?? (date < semester.startDate || date > semester.endDate ? "Outside semester" : "No classes");
      }
      days.push({ date, weekday, teaching: isTeaching, note });
    }
    return { week, weeks, start, end, days };
  } catch {
    return null;
  }
}

/**
 * The only unauthenticated read. Serves the published timetable filtered by one
 * of section / faculty / room.
 *
 * `entries` is the typical week (the recurring pattern). `sessions` are the real
 * dated classes for ONE week (`week`, or the week containing `date`), so the
 * board shows what actually happens — holidays, moves and extra classes included —
 * without shipping the whole semester.
 */
export async function GET(req: Request) {
  try {
    await connectAndRegister();
    const { searchParams } = new URL(req.url);
    const view = searchParams.get("view") ?? "section";
    const id = searchParams.get("id");
    const universitySlug = searchParams.get("university")?.trim().toLowerCase();
    const semesterId = searchParams.get("semester");
    const weekParam = searchParams.get("week");
    const dateParam = searchParams.get("date");

    if (!universitySlug) return fail("A university is required.", 400);
    if (semesterId && !isValidObjectId(semesterId)) return fail("Semester not found.", 404);
    const university = await University.findOne({
      active: true,
      $or: [{ slug: universitySlug }, { code: universitySlug.toUpperCase() }],
    }).lean();
    if (!university) return fail("University not found.", 404);
    const universityId = university?._id;
    const [settings, slots, timetable] = await Promise.all([
      Settings.findOne({ universityId }).lean(),
      TimeSlot.find({ universityId, active: true }).sort({ order: 1 }).lean(),
      Timetable.findOne({
        universityId,
        status: "PUBLISHED",
        ...(semesterId ? { semester: semesterId } : {}),
      }).sort({ updatedAt: -1 })
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

    const [sections, faculty, rooms, publishedTimetables] = await Promise.all([
      Section.find({ universityId, active: true }).select("number program semester").sort({ number: 1 }).lean(),
      Faculty.find({ universityId, active: true }).select("name facultyId department").sort({ name: 1 }).lean(),
      Room.find({ universityId, active: true }).select("code block type").sort({ block: 1, code: 1 }).lean(),
      Timetable.find({ universityId, status: "PUBLISHED" })
        .select("semester name academicYear term updatedAt")
        .populate("semester", "name startDate endDate")
        .sort({ updatedAt: -1 })
        .lean(),
    ]);

    const directory = { sections, faculty, rooms };

    if (!timetable) {
      return ok({
        published: false, settings, slots, directory,
        entries: [], sessions: [], semester: null, meta: null, calendar: null,
        university: { name: university.name, code: university.code, slug: university.slug ?? university.code.toLowerCase() },
        publishedSemesters: publishedTimetables.map((item: any) => ({
          id: item.semester?._id ? String(item.semester._id) : null,
          name: item.semester?.name ?? item.name,
          startDate: item.semester?.startDate ?? null,
          endDate: item.semester?.endDate ?? null,
          academicYear: item.academicYear,
          term: item.term,
        })),
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
    const calendar = resolveWeek(semester, weekParam, dateParam);
    if (calendar) {
      sessions = sessions.filter((s: any) => s.date >= calendar.start && s.date <= calendar.end);
    }

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
      calendar,
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
      university: { name: university.name, code: university.code, slug: university.slug ?? university.code.toLowerCase() },
      publishedSemesters: publishedTimetables.map((item: any) => ({
        id: item.semester?._id ? String(item.semester._id) : null,
        name: item.semester?.name ?? item.name,
        startDate: item.semester?.startDate ?? null,
        endDate: item.semester?.endDate ?? null,
        academicYear: item.academicYear,
        term: item.term,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
