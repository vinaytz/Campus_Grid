/**
 * Seeds a realistic starting dataset: an admin, a bell schedule with lunch,
 * rooms of varying capacity, faculty, subjects, sections and teaching load.
 * Run with: npm run seed
 */
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import User from "../src/models/User";
import Settings from "../src/models/Settings";
import TimeSlot from "../src/models/TimeSlot";
import Room from "../src/models/Room";
import Faculty from "../src/models/Faculty";
import Subject from "../src/models/Subject";
import Section from "../src/models/Section";
import Assignment from "../src/models/Assignment";
import Timetable from "../src/models/Timetable";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing — copy .env.example to .env first.");
  await mongoose.connect(uri);
  console.log("→ connected");

  await Promise.all([
    User.deleteMany({}), Settings.deleteMany({}), TimeSlot.deleteMany({}),
    Room.deleteMany({}), Faculty.deleteMany({}), Subject.deleteMany({}),
    Section.deleteMany({}), Assignment.deleteMany({}), Timetable.deleteMany({}),
  ]);

  await User.create({
    name: "Timetable Administrator",
    email: (process.env.SEED_ADMIN_EMAIL ?? "admin@school.edu").toLowerCase(),
    passwordHash: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!", 12),
    role: "ADMIN",
  });

  await Settings.create({
    institutionName: "Institute of Technology",
    academicYear: "2025-26",
    term: "Odd",
    workingDays: [1, 2, 3, 4, 5],
    maxHoursPerDayPerSection: 7,
    maxConsecutiveHoursPerFaculty: 3,
    allowSessionsAcrossBreak: false,
  });

  await TimeSlot.insertMany([
    { order: 0, label: "Period 1", start: "09:00", end: "09:50", kind: "CLASS" },
    { order: 1, label: "Period 2", start: "09:50", end: "10:40", kind: "CLASS" },
    { order: 2, label: "Period 3", start: "10:40", end: "11:30", kind: "CLASS" },
    { order: 3, label: "Period 4", start: "11:30", end: "12:20", kind: "CLASS" },
    { order: 4, label: "Lunch", start: "12:20", end: "13:10", kind: "BREAK" },
    { order: 5, label: "Period 5", start: "13:10", end: "14:00", kind: "CLASS" },
    { order: 6, label: "Period 6", start: "14:00", end: "14:50", kind: "CLASS" },
    { order: 7, label: "Period 7", start: "14:50", end: "15:40", kind: "CLASS" },
    { order: 8, label: "Period 8", start: "15:40", end: "16:30", kind: "CLASS" },
  ]);

  const rooms = await Room.insertMany([
    { code: "101", block: "A", capacity: 70, type: "LECTURE" },
    { code: "102", block: "A", capacity: 70, type: "LECTURE" },
    { code: "103", block: "A", capacity: 45, type: "LECTURE" },
    { code: "201", block: "B", capacity: 60, type: "LECTURE" },
    { code: "202", block: "B", capacity: 60, type: "LECTURE" },
    // Lab capacity must cover the largest section that has a lab, or those
    // sessions can never be placed. Sections here run 44-62 students.
    { code: "301", block: "B", capacity: 65, type: "LAB" },
    { code: "302", block: "B", capacity: 60, type: "LAB" },
    { code: "303", block: "C", capacity: 50, type: "LAB" },
    { code: "401", block: "C", capacity: 120, type: "AUDITORIUM" },
  ]);

  const faculty = await Faculty.insertMany([
    { facultyId: "23314", name: "Praveen Malik", department: "Electronics", designation: "Assistant Professor" },
    { facultyId: "23315", name: "Anjali Sharma", department: "Computer Science", designation: "Associate Professor" },
    { facultyId: "23316", name: "Rakesh Verma", department: "Computer Science", designation: "Professor" },
    { facultyId: "23317", name: "Meera Iyer", department: "Mathematics", designation: "Assistant Professor" },
    { facultyId: "23318", name: "Sandeep Rao", department: "Electronics", designation: "Assistant Professor" },
    { facultyId: "23319", name: "Kavita Nair", department: "Humanities", designation: "Lecturer" },
  ]);

  const subjects = await Subject.insertMany([
    { code: "ECE281", name: "Introduction to IoT", department: "Electronics", credits: 4 },
    { code: "CSE201", name: "Data Structures", department: "Computer Science", credits: 4 },
    { code: "CSE202", name: "Operating Systems", department: "Computer Science", credits: 3 },
    { code: "MTH204", name: "Discrete Mathematics", department: "Mathematics", credits: 3 },
    { code: "ECE245", name: "Digital Electronics", department: "Electronics", credits: 4 },
    { code: "HUM110", name: "Technical Communication", department: "Humanities", credits: 2 },
  ]);

  const sections = await Section.insertMany([
    { number: "2403", program: "B.Tech CSE", semester: 4, strength: 58, homeRoom: rooms[3]._id },
    { number: "2404", program: "B.Tech CSE", semester: 4, strength: 62, homeRoom: rooms[4]._id },
    { number: "2405", program: "B.Tech ECE", semester: 4, strength: 44, homeRoom: rooms[2]._id },
  ]);

  const f = (id: string) => faculty.find((x) => x.facultyId === id)!._id;
  const s = (code: string) => subjects.find((x) => x.code === code)!._id;

  const load: any[] = [];
  for (const section of sections) {
    const isEce = section.program.includes("ECE");
    load.push(
      { section: section._id, subject: s("MTH204"), faculty: f("23317"), kind: "LECTURE", duration: 1, sessionsPerWeek: 3 },
      { section: section._id, subject: s("HUM110"), faculty: f("23319"), kind: "LECTURE", duration: 1, sessionsPerWeek: 2 },
    );
    if (isEce) {
      load.push(
        { section: section._id, subject: s("ECE281"), faculty: f("23314"), kind: "LECTURE", duration: 1, sessionsPerWeek: 3 },
        { section: section._id, subject: s("ECE281"), faculty: f("23314"), kind: "LAB", duration: 2, sessionsPerWeek: 1, requiredRoomType: "LAB" },
        { section: section._id, subject: s("ECE245"), faculty: f("23318"), kind: "LECTURE", duration: 1, sessionsPerWeek: 3 },
      );
    } else {
      load.push(
        { section: section._id, subject: s("CSE201"), faculty: f("23315"), kind: "LECTURE", duration: 1, sessionsPerWeek: 3 },
        { section: section._id, subject: s("CSE201"), faculty: f("23315"), kind: "LAB", duration: 2, sessionsPerWeek: 1, requiredRoomType: "LAB" },
        { section: section._id, subject: s("CSE202"), faculty: f("23316"), kind: "LECTURE", duration: 1, sessionsPerWeek: 3 },
      );
    }
  }
  await Assignment.insertMany(load);

  console.log(`→ seeded ${faculty.length} faculty, ${subjects.length} subjects, ${rooms.length} rooms, ${sections.length} sections, ${load.length} assignments`);
  console.log(`→ sign in as ${process.env.SEED_ADMIN_EMAIL ?? "admin@school.edu"}`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
