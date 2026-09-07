/**
 * Seeds a realistic starting dataset.
 *
 * The numbers here are deliberate, not decorative. The semester below has 66
 * confirmed teaching days across 15 weeks once its holidays, the exam block and
 * one special working Saturday are applied, and every assignment's
 * `requiredSessions` is set so the reconciliation step has real work to do:
 *
 *   - courses whose weekly pattern OVER-produces (40 needed, ~42 candidates)
 *     exercise the distributed trim
 *   - courses that UNDER-produce (CSE202: 30 needed, ~26 candidates) exercise
 *     the remainder search
 *
 * Two deliberately impossible assignments are included but left inactive, so
 * the default seed generates cleanly while the infeasibility diagnostics are one
 * toggle away. See the console output at the end.
 *
 * Run with: npm run seed
 */
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import User from "../src/models/User";
import Settings from "../src/models/Settings";
import Semester from "../src/models/Semester";
import TimeSlot from "../src/models/TimeSlot";
import Room from "../src/models/Room";
import Faculty from "../src/models/Faculty";
import Subject from "../src/models/Subject";
import Section from "../src/models/Section";
import Assignment from "../src/models/Assignment";
import Timetable from "../src/models/Timetable";
import { buildTeachingDays, teachingWeekCount } from "../src/lib/scheduler/calendar";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing — copy .env.example to .env first.");
  await mongoose.connect(uri);
  console.log("→ connected");

  await Promise.all([
    User.deleteMany({}), Settings.deleteMany({}), TimeSlot.deleteMany({}),
    Room.deleteMany({}), Faculty.deleteMany({}), Subject.deleteMany({}),
    Section.deleteMany({}), Assignment.deleteMany({}), Timetable.deleteMany({}),
    Semester.deleteMany({}),
  ]);

  await User.create({
    name: "Timetable Administrator",
    email: (process.env.SEED_ADMIN_EMAIL ?? "admin@school.edu").toLowerCase(),
    passwordHash: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!", 12),
    role: "ADMIN",
  });

  /* ── Rules ──────────────────────────────────────────────────────────────
   * Note there is no universal lunch break. Every period below is teachable;
   * the free afternoon period is pursued per section as a soft objective inside
   * the 12:00–15:00 window, so different sections get their break at different
   * times. */
  await Settings.create({
    institutionName: "Institute of Technology",
    academicYear: "2025-26",
    term: "Odd",
    workingDays: [1, 2, 3, 4, 5],
    maxHoursPerDayPerSection: 7,
    maxConsecutiveHoursPerFaculty: 3,
    allowSessionsAcrossBreak: false,
    maxSessionsPerAssignmentPerDay: 1,
    preferAfternoonBreak: true,
    afternoonWindowStart: "12:00",
    afternoonWindowEnd: "15:00",
  });

  /* ── Calendar ─────────────────────────────────────────────────────────── */
  const semesterSpec = {
    name: "Odd Semester 2025",
    academicYear: "2025-26",
    term: "Odd",
    startDate: "2025-07-21",  // a Monday
    endDate: "2025-10-31",    // a Friday
    teachingWeekdays: [1, 2, 3, 4, 5],
    exceptions: [
      { date: "2025-08-15", kind: "HOLIDAY", label: "Independence Day" },
      { date: "2025-10-02", kind: "HOLIDAY", label: "Gandhi Jayanti" },
      { date: "2025-10-20", endDate: "2025-10-22", kind: "HOLIDAY", label: "Diwali break" },
      { date: "2025-09-08", endDate: "2025-09-12", kind: "EXAM", label: "Mid-semester examinations" },
      { date: "2025-09-26", kind: "EVENT", label: "Annual technical festival" },
      // An irregular working day: a Saturday that runs Friday's timetable to
      // make up for the Independence Day holiday.
      {
        date: "2025-08-23", kind: "SPECIAL_WORKING",
        label: "Working Saturday (follows Friday)", followsWeekday: 5,
      },
    ],
    active: true,
  };
  const semester = await Semester.create(semesterSpec);

  const teachingDays = buildTeachingDays(semesterSpec as any);
  const weeks = teachingWeekCount(teachingDays);

  /* ── Bell schedule: nine teachable periods, no blanket lunch ──────────── */
  await TimeSlot.insertMany([
    { order: 0, label: "Period 1", start: "09:00", end: "09:50", kind: "CLASS" },
    { order: 1, label: "Period 2", start: "09:50", end: "10:40", kind: "CLASS" },
    { order: 2, label: "Period 3", start: "10:40", end: "11:30", kind: "CLASS" },
    { order: 3, label: "Period 4", start: "11:30", end: "12:20", kind: "CLASS" },
    { order: 4, label: "Period 5", start: "12:20", end: "13:10", kind: "CLASS" },
    { order: 5, label: "Period 6", start: "13:10", end: "14:00", kind: "CLASS" },
    { order: 6, label: "Period 7", start: "14:00", end: "14:50", kind: "CLASS" },
    { order: 7, label: "Period 8", start: "14:50", end: "15:40", kind: "CLASS" },
    { order: 8, label: "Period 9", start: "15:40", end: "16:30", kind: "CLASS" },
  ]);

  /* ── Rooms: varied capacity, types and capability tags ────────────────── */
  const rooms = await Room.insertMany([
    { code: "101", block: "A", capacity: 70, type: "CLASSROOM", capabilities: ["PROJECTOR"] },
    { code: "102", block: "A", capacity: 70, type: "CLASSROOM", capabilities: ["PROJECTOR"] },
    { code: "103", block: "A", capacity: 45, type: "CLASSROOM", capabilities: ["PROJECTOR"] },
    { code: "201", block: "B", capacity: 65, type: "CLASSROOM", capabilities: ["PROJECTOR", "SMARTBOARD"] },
    { code: "202", block: "B", capacity: 65, type: "CLASSROOM", capabilities: ["PROJECTOR"] },
    { code: "301", block: "B", capacity: 65, type: "LAB", capabilities: ["COMPUTER", "PROJECTOR", "LAB_BENCH"] },
    // The BYOD lab — the only room that can host the bring-your-own-device workshop.
    { code: "302", block: "B", capacity: 65, type: "LAB", capabilities: ["COMPUTER", "BYOD", "PROJECTOR"] },
    { code: "303", block: "C", capacity: 48, type: "LAB", capabilities: ["OSCILLOSCOPE", "LAB_BENCH", "COMPUTER"] },
    { code: "401", block: "C", capacity: 150, type: "AUDITORIUM", capabilities: ["PROJECTOR"] },
    // Deliberately too small for every section here — proves capacity is enforced.
    { code: "105", block: "D", capacity: 30, type: "CLASSROOM", capabilities: [] },
  ]);

  const faculty = await Faculty.insertMany([
    { facultyId: "23314", name: "Praveen Malik", department: "Electronics", designation: "Assistant Professor", maxHoursPerDay: 5 },
    { facultyId: "23315", name: "Anjali Sharma", department: "Computer Science", designation: "Associate Professor", maxHoursPerDay: 5 },
    { facultyId: "23316", name: "Rakesh Verma", department: "Computer Science", designation: "Professor", maxHoursPerDay: 4 },
    // A part-time lecturer with real blocked windows — she cannot teach on
    // Wednesday mornings, which the scheduler must respect.
    {
      facultyId: "23317", name: "Meera Iyer", department: "Mathematics", designation: "Assistant Professor",
      maxHoursPerDay: 5,
      unavailability: [
        { day: 3, slotOrder: 0 }, { day: 3, slotOrder: 1 }, { day: 3, slotOrder: 2 },
      ],
    },
    { facultyId: "23318", name: "Sandeep Rao", department: "Electronics", designation: "Assistant Professor", maxHoursPerDay: 5 },
    { facultyId: "23319", name: "Kavita Nair", department: "Humanities", designation: "Lecturer", maxHoursPerDay: 4 },
  ]);

  const subjects = await Subject.insertMany([
    { code: "ECE281", name: "Introduction to IoT", department: "Electronics", type: "THEORY", defaultDuration: 1, credits: 4 },
    { code: "ECE282", name: "IoT Laboratory", department: "Electronics", type: "LAB", defaultDuration: 3, credits: 2 },
    { code: "ECE245", name: "Digital Electronics", department: "Electronics", type: "THEORY", defaultDuration: 1, credits: 4 },
    { code: "CSE201", name: "Data Structures", department: "Computer Science", type: "THEORY", defaultDuration: 1, credits: 4 },
    { code: "CSE203", name: "Data Structures Laboratory", department: "Computer Science", type: "LAB", defaultDuration: 2, credits: 2 },
    { code: "CSE202", name: "Operating Systems", department: "Computer Science", type: "THEORY", defaultDuration: 1, credits: 3 },
    { code: "CSE210", name: "Applied Computing Workshop", department: "Computer Science", type: "TUTORIAL", defaultDuration: 2, credits: 2 },
    { code: "MTH204", name: "Discrete Mathematics", department: "Mathematics", type: "THEORY", defaultDuration: 1, credits: 3 },
    { code: "HUM110", name: "Technical Communication", department: "Humanities", type: "THEORY", defaultDuration: 1, credits: 2 },
    { code: "ECE499", name: "Capstone Studio", department: "Electronics", type: "PROJECT", defaultDuration: 3, credits: 4 },
  ]);

  const sections = await Section.insertMany([
    { number: "2403", program: "B.Tech CSE", semester: 4, strength: 58 },
    { number: "2404", program: "B.Tech CSE", semester: 4, strength: 62 },
    { number: "2405", program: "B.Tech ECE", semester: 4, strength: 44 },
  ]);

  const f = (id: string) => faculty.find((x) => x.facultyId === id)!._id;
  const s = (code: string) => subjects.find((x) => x.code === code)!._id;
  const sec = (number: string) => sections.find((x) => x.number === number)!._id;
  const room = (name: string) => {
    const [block, code] = name.split("-");
    return rooms.find((r) => r.block === block && r.code === code)!._id;
  };

  /* ── Teaching load ─────────────────────────────────────────────────────
   * requiredSessions is the exact semester total. Weekly counts vary freely. */
  const load: any[] = [
    /* Section 2403 — B.Tech CSE, 58 students */
    { section: sec("2403"), subject: s("MTH204"), faculty: f("23317"), kind: "LECTURE", duration: 1, requiredSessions: 40, targetWeeklyFrequency: 3 },
    { section: sec("2403"), subject: s("HUM110"), faculty: f("23319"), kind: "LECTURE", duration: 1, requiredSessions: 26, targetWeeklyFrequency: 2 },
    { section: sec("2403"), subject: s("CSE201"), faculty: f("23315"), kind: "LECTURE", duration: 1, requiredSessions: 40, targetWeeklyFrequency: 3 },
    // Restricted to the two computer labs — a practical course that may not be
    // taught anywhere else.
    {
      section: sec("2403"), subject: s("CSE203"), faculty: f("23315"), kind: "LAB", duration: 2,
      requiredSessions: 13, roomSelection: "ALLOWED_ROOMS",
      allowedRooms: [room("B-301"), room("B-302")], requiredRoomType: "LAB",
      requiredCapabilities: ["COMPUTER"],
    },
    // 30 sessions from a 2-a-week pattern under-produces on this calendar, so
    // the remainder search has to find the last few dates.
    { section: sec("2403"), subject: s("CSE202"), faculty: f("23316"), kind: "LECTURE", duration: 1, requiredSessions: 30, targetWeeklyFrequency: 2 },
    // Needs BYOD, which only B-302 has — capability matching, not room type.
    {
      section: sec("2403"), subject: s("CSE210"), faculty: f("23316"), kind: "TUTORIAL", duration: 2,
      requiredSessions: 13, requiredRoomType: "LAB", requiredCapabilities: ["BYOD"],
    },

    /* Section 2404 — B.Tech CSE, 62 students */
    { section: sec("2404"), subject: s("MTH204"), faculty: f("23317"), kind: "LECTURE", duration: 1, requiredSessions: 40, targetWeeklyFrequency: 3 },
    { section: sec("2404"), subject: s("HUM110"), faculty: f("23319"), kind: "LECTURE", duration: 1, requiredSessions: 26, targetWeeklyFrequency: 2 },
    { section: sec("2404"), subject: s("CSE201"), faculty: f("23315"), kind: "LECTURE", duration: 1, requiredSessions: 40, targetWeeklyFrequency: 3 },
    {
      section: sec("2404"), subject: s("CSE203"), faculty: f("23315"), kind: "LAB", duration: 2,
      requiredSessions: 13, roomSelection: "ALLOWED_ROOMS",
      allowedRooms: [room("B-301"), room("B-302")], requiredRoomType: "LAB",
      requiredCapabilities: ["COMPUTER"],
    },
    { section: sec("2404"), subject: s("CSE202"), faculty: f("23316"), kind: "LECTURE", duration: 1, requiredSessions: 30, targetWeeklyFrequency: 2 },

    /* Section 2405 — B.Tech ECE, 44 students */
    { section: sec("2405"), subject: s("MTH204"), faculty: f("23317"), kind: "LECTURE", duration: 1, requiredSessions: 40, targetWeeklyFrequency: 3 },
    { section: sec("2405"), subject: s("HUM110"), faculty: f("23319"), kind: "LECTURE", duration: 1, requiredSessions: 26, targetWeeklyFrequency: 2 },
    { section: sec("2405"), subject: s("ECE281"), faculty: f("23314"), kind: "LECTURE", duration: 1, requiredSessions: 40, targetWeeklyFrequency: 3 },
    // The specification's own example: a 3-hour lab, 13 times a semester, pinned
    // to the one bench lab with oscilloscopes.
    {
      section: sec("2405"), subject: s("ECE282"), faculty: f("23314"), kind: "LAB", duration: 3,
      requiredSessions: 13, roomSelection: "FIXED", fixedRoom: room("C-303"),
    },
    { section: sec("2405"), subject: s("ECE245"), faculty: f("23318"), kind: "LECTURE", duration: 1, requiredSessions: 40, targetWeeklyFrequency: 3 },

    /* ── Two deliberately impossible assignments, left INACTIVE ───────────
     * Activate either one on the Teaching load screen and regenerate to see the
     * INFEASIBLE diagnostic name the assignment and explain the cause. */
    {
      // No room anywhere has a CLEANROOM tag.
      section: sec("2404"), subject: s("ECE499"), faculty: f("23318"), kind: "LAB", duration: 3,
      requiredSessions: 13, requiredRoomType: "LAB", requiredCapabilities: ["CLEANROOM"],
      active: false,
    },
    {
      // Demands more sessions than the calendar can hold at one meeting per day.
      section: sec("2405"), subject: s("ECE499"), faculty: f("23318"), kind: "LECTURE", duration: 1,
      requiredSessions: 90, active: false,
    },
  ];

  await Assignment.insertMany(load);

  const active = load.filter((a) => a.active !== false);
  const totalSessions = active.reduce((n, a) => n + a.requiredSessions, 0);
  const totalPeriods = active.reduce((n, a) => n + a.requiredSessions * a.duration, 0);

  console.log(`→ semester "${semesterSpec.name}": ${semesterSpec.startDate} → ${semesterSpec.endDate}`);
  console.log(`  ${teachingDays.length} teaching days across ${weeks} weeks (after ${semesterSpec.exceptions.length} calendar exceptions)`);
  console.log(`→ seeded ${faculty.length} faculty, ${subjects.length} subjects, ${rooms.length} rooms, ${sections.length} sections`);
  console.log(`→ ${active.length} active assignments: ${totalSessions} sessions / ${totalPeriods} periods to place`);
  console.log(`  room-periods available: ${teachingDays.length * 9 * rooms.length}`);
  console.log(`→ 2 impossible assignments seeded INACTIVE — activate one to see the infeasibility report`);
  console.log(`→ sign in as ${process.env.SEED_ADMIN_EMAIL ?? "admin@school.edu"}`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
