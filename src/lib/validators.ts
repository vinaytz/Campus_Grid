import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "must be a valid id");
const optionalId = z.union([objectId, z.literal(""), z.null()]).optional()
  .transform((v) => (v ? v : undefined));

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const timeSlotSchema = z.object({
  label: z.string().min(1, "Give the period a label"),
  start: z.string().regex(/^\d{2}:\d{2}$/, "use HH:MM"),
  end: z.string().regex(/^\d{2}:\d{2}$/, "use HH:MM"),
  order: z.coerce.number().int().min(0),
  kind: z.enum(["CLASS", "BREAK"]).default("CLASS"),
  active: z.coerce.boolean().default(true),
}).refine((v) => v.start < v.end, { message: "End time must be after start time", path: ["end"] });

export const roomSchema = z.object({
  code: z.string().min(1, "Room number is required"),
  block: z.string().min(1, "Block is required"),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1"),
  type: z.enum(["LECTURE", "LAB", "SEMINAR", "AUDITORIUM"]).default("LECTURE"),
  active: z.coerce.boolean().default(true),
});

export const facultySchema = z.object({
  facultyId: z.string().min(1, "Faculty ID is required"),
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  department: z.string().min(1, "Department is required"),
  designation: z.string().optional(),
  maxHoursPerWeek: z.coerce.number().int().min(1).max(60).default(18),
  maxHoursPerDay: z.coerce.number().int().min(1).max(12).default(5),
  unavailability: z.array(z.object({
    day: z.coerce.number().int().min(0).max(6),
    slotOrder: z.coerce.number().int().min(0),
  })).default([]),
  active: z.coerce.boolean().default(true),
});

export const subjectSchema = z.object({
  code: z.string().min(2, "Subject code is required"),
  name: z.string().min(2, "Subject name is required"),
  department: z.string().min(1, "Department is required"),
  credits: z.coerce.number().min(0).max(12).default(3),
  active: z.coerce.boolean().default(true),
});

export const sectionSchema = z.object({
  number: z.string().min(1, "Section number is required"),
  program: z.string().min(1, "Program is required"),
  semester: z.coerce.number().int().min(1).max(12),
  strength: z.coerce.number().int().min(1, "Enter the number of students"),
  homeRoom: optionalId,
  active: z.coerce.boolean().default(true),
});

export const assignmentSchema = z.object({
  section: objectId,
  subject: objectId,
  faculty: objectId,
  kind: z.enum(["LECTURE", "LAB", "TUTORIAL"]).default("LECTURE"),
  duration: z.coerce.number().int().min(1).max(3).default(1),
  sessionsPerWeek: z.coerce.number().int().min(1).max(10).default(3),
  requiredRoomType: z.enum(["LECTURE", "LAB", "SEMINAR", "AUDITORIUM"]).optional(),
  fixedRoom: optionalId,
  active: z.coerce.boolean().default(true),
});

export const settingsSchema = z.object({
  institutionName: z.string().min(1),
  academicYear: z.string().min(1),
  term: z.string().min(1),
  workingDays: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Pick at least one working day"),
  maxHoursPerDayPerSection: z.coerce.number().int().min(1).max(12),
  maxConsecutiveHoursPerFaculty: z.coerce.number().int().min(1).max(8),
  allowSessionsAcrossBreak: z.coerce.boolean().default(false),
});

export const generateSchema = z.object({
  name: z.string().min(1, "Name this timetable"),
  sections: z.array(objectId).optional(),
  seed: z.coerce.number().optional(),
  /** Create the timetable with no entries, for hand-building on the canvas. */
  empty: z.coerce.boolean().optional(),
});

export const moveEntrySchema = z.object({
  entryId: objectId,
  day: z.coerce.number().int().min(0).max(6),
  slotOrder: z.coerce.number().int().min(0),
  room: optionalId,
});
