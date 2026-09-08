import "dotenv/config";
import mongoose from "mongoose";
import User from "../src/models/User";
import University from "../src/models/University";
import Settings from "../src/models/Settings";
import Semester from "../src/models/Semester";
import TimeSlot from "../src/models/TimeSlot";
import Room from "../src/models/Room";
import Faculty from "../src/models/Faculty";
import Subject from "../src/models/Subject";
import Section from "../src/models/Section";
import Assignment from "../src/models/Assignment";

const email = (process.argv[2] ?? "vinay@lpu.in").toLowerCase();

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
  await mongoose.connect(process.env.MONGODB_URI);

  const user = await User.findOne({ email }).lean();
  if (!user?.universityId) throw new Error(`University Admin ${email} was not found.`);
  const university = await University.findById(user.universityId).lean();
  if (!university) throw new Error(`University for ${email} was not found.`);

  const tenant = { universityId: university._id };
  const existing = await Promise.all([
    Semester.countDocuments(tenant), TimeSlot.countDocuments(tenant),
    Room.countDocuments(tenant), Faculty.countDocuments(tenant),
    Subject.countDocuments(tenant), Section.countDocuments(tenant),
    Assignment.countDocuments(tenant),
  ]);
  if (existing.some(Boolean)) {
    throw new Error(`Tenant ${university.code} already contains scheduling data. Refusing to overwrite it.`);
  }

  await Settings.findOneAndUpdate(
    tenant,
    {
      ...tenant,
      institutionName: university.name,
      academicYear: "2026-27",
      term: "Odd",
      workingDays: [1, 2, 3, 4, 5],
      maxHoursPerDayPerSection: 7,
      maxConsecutiveHoursPerFaculty: 3,
      allowSessionsAcrossBreak: false,
      maxSessionsPerAssignmentPerDay: 1,
      preferAfternoonBreak: true,
      afternoonWindowStart: "12:00",
      afternoonWindowEnd: "15:00",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Semester.create({
    ...tenant,
    name: "Odd Semester 2026",
    academicYear: "2026-27",
    term: "Odd",
    startDate: "2026-07-20",
    endDate: "2026-11-13",
    teachingWeekdays: [1, 2, 3, 4, 5],
    exceptions: [
      { date: "2026-08-15", kind: "HOLIDAY", label: "Independence Day" },
      { date: "2026-09-02", kind: "HOLIDAY", label: "University holiday" },
      { date: "2026-10-19", endDate: "2026-10-23", kind: "EXAM", label: "Mid-semester examinations" },
      { date: "2026-11-09", endDate: "2026-11-11", kind: "HOLIDAY", label: "Festival break" },
    ],
    active: true,
  });

  await TimeSlot.insertMany([
    ["Period 1", "09:00", "09:50"], ["Period 2", "09:50", "10:40"],
    ["Period 3", "10:40", "11:30"], ["Period 4", "11:30", "12:20"],
    ["Period 5", "12:20", "13:10"], ["Period 6", "13:10", "14:00"],
    ["Period 7", "14:00", "14:50"], ["Period 8", "14:50", "15:40"],
    ["Period 9", "15:40", "16:30"],
  ].map(([label, start, end], order) => ({
    ...tenant, label, start, end, order, kind: "CLASS", active: true,
  })));

  const rooms = await Room.insertMany([
    { ...tenant, block: "A", code: "101", capacity: 80, type: "CLASSROOM", capabilities: ["PROJECTOR"] },
    { ...tenant, block: "A", code: "102", capacity: 65, type: "CLASSROOM", capabilities: ["PROJECTOR", "SMARTBOARD"] },
    { ...tenant, block: "B", code: "201", capacity: 70, type: "LAB", capabilities: ["COMPUTER", "PROJECTOR", "LAB_BENCH"] },
    { ...tenant, block: "B", code: "202", capacity: 70, type: "LAB", capabilities: ["COMPUTER", "BYOD", "PROJECTOR"] },
    { ...tenant, block: "C", code: "301", capacity: 180, type: "AUDITORIUM", capabilities: ["PROJECTOR"] },
  ]);

  const faculty = await Faculty.insertMany([
    { ...tenant, facultyId: "LPU-F001", name: "Dr. Ananya Sharma", department: "Computer Science", designation: "Professor", maxHoursPerDay: 5, maxHoursPerWeek: 24 },
    { ...tenant, facultyId: "LPU-F002", name: "Dr. Karan Mehta", department: "Computer Science", designation: "Associate Professor", maxHoursPerDay: 5, maxHoursPerWeek: 24 },
    { ...tenant, facultyId: "LPU-F003", name: "Dr. Neha Kapoor", department: "Mathematics", designation: "Assistant Professor", maxHoursPerDay: 5, maxHoursPerWeek: 20, unavailability: [{ day: 3, slotOrder: 0 }, { day: 3, slotOrder: 1 }] },
    { ...tenant, facultyId: "LPU-F004", name: "Dr. Rohan Singh", department: "Electronics", designation: "Assistant Professor", maxHoursPerDay: 5, maxHoursPerWeek: 20 },
  ]);

  const subjects = await Subject.insertMany([
    { ...tenant, code: "CSE101", name: "Programming Fundamentals", department: "Computer Science", type: "THEORY", defaultDuration: 1, credits: 4 },
    { ...tenant, code: "CSE102", name: "Programming Laboratory", department: "Computer Science", type: "LAB", defaultDuration: 2, credits: 2 },
    { ...tenant, code: "CSE201", name: "Data Structures", department: "Computer Science", type: "THEORY", defaultDuration: 1, credits: 4 },
    { ...tenant, code: "MAT101", name: "Discrete Mathematics", department: "Mathematics", type: "THEORY", defaultDuration: 1, credits: 3 },
    { ...tenant, code: "ECE110", name: "Digital Systems", department: "Electronics", type: "LAB", defaultDuration: 2, credits: 3 },
  ]);

  const sections = await Section.insertMany([
    { ...tenant, number: "LPU-CSE-1A", program: "B.Tech Computer Science", semester: 1, strength: 58, homeRoom: rooms[0]._id },
    { ...tenant, number: "LPU-CSE-1B", program: "B.Tech Computer Science", semester: 1, strength: 52, homeRoom: rooms[1]._id },
  ]);

  const byCode = <T extends { _id: mongoose.Types.ObjectId; code?: string; facultyId?: string; number?: string }>(
    rows: T[], key: keyof T, value: string
  ) => rows.find(row => row[key] === value)!._id;
  const facultyId = (value: string) => faculty.find(row => row.facultyId === value)!._id;
  const subjectId = (value: string) => byCode(subjects, "code", value);

  await Assignment.insertMany([
    { ...tenant, section: sections[0]._id, subject: subjectId("CSE101"), faculty: facultyId("LPU-F001"), kind: "LECTURE", duration: 1, requiredSessions: 32, targetWeeklyFrequency: 3, roomSelection: "AUTO", allowedRooms: [], requiredRoomType: "CLASSROOM", requiredCapabilities: ["PROJECTOR"] },
    { ...tenant, section: sections[0]._id, subject: subjectId("CSE102"), faculty: facultyId("LPU-F002"), kind: "LAB", duration: 2, requiredSessions: 16, targetWeeklyFrequency: 2, roomSelection: "AUTO", allowedRooms: [], requiredRoomType: "LAB", requiredCapabilities: ["COMPUTER"] },
    { ...tenant, section: sections[0]._id, subject: subjectId("MAT101"), faculty: facultyId("LPU-F003"), kind: "LECTURE", duration: 1, requiredSessions: 24, targetWeeklyFrequency: 2, roomSelection: "AUTO", allowedRooms: [], requiredRoomType: "CLASSROOM", requiredCapabilities: [] },
    { ...tenant, section: sections[1]._id, subject: subjectId("CSE201"), faculty: facultyId("LPU-F002"), kind: "LECTURE", duration: 1, requiredSessions: 32, targetWeeklyFrequency: 3, roomSelection: "AUTO", allowedRooms: [], requiredRoomType: "CLASSROOM", requiredCapabilities: ["PROJECTOR"] },
    { ...tenant, section: sections[1]._id, subject: subjectId("ECE110"), faculty: facultyId("LPU-F004"), kind: "LAB", duration: 2, requiredSessions: 16, targetWeeklyFrequency: 2, roomSelection: "FIXED", fixedRoom: rooms[2]._id, allowedRooms: [], requiredRoomType: "LAB", requiredCapabilities: ["COMPUTER"] },
    { ...tenant, section: sections[1]._id, subject: subjectId("MAT101"), faculty: facultyId("LPU-F003"), kind: "LECTURE", duration: 1, requiredSessions: 24, targetWeeklyFrequency: 2, roomSelection: "AUTO", allowedRooms: [], requiredRoomType: "CLASSROOM", requiredCapabilities: [] },
  ]);

  console.log(`Seeded ${university.name} (${university.code}) for ${email}: 4 faculty, 5 subjects, 5 rooms, 2 sections, 6 assignments.`);
  await mongoose.disconnect();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
