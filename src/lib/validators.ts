import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "must be a valid id");
const optionalId = z.union([objectId, z.literal(""), z.null()]).optional()
  .transform((v) => (v ? v : undefined));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use yyyy-mm-dd");
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "use HH:MM");

const isEmpty = (v: unknown) => v === "" || v === null || v === undefined;

/**
 * A yes/no value as a person would write it.
 *
 * `z.coerce.boolean()` is unusable for imported data: it is just `Boolean(v)`, so
 * the string "no" comes out `true` and a row marked inactive would be imported
 * as active. This reads the spellings an admin actually types, and treats a
 * blank cell as "yes" so the column can be left out entirely.
 */
const boolish = z.union([z.boolean(), z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (isEmpty(v)) return true;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    return !["0", "false", "no", "n", "off", "inactive", "disabled"].includes(
      String(v).trim().toLowerCase()
    );
  });

/** An integer that may arrive as a blank spreadsheet cell. */
function intOr(fallback: number, min: number, max: number) {
  return z.union([z.literal(""), z.null(), z.undefined(), z.coerce.number()])
    .transform((v) => (isEmpty(v) ? fallback : Number(v)))
    .pipe(z.number().int().min(min).max(max));
}

/** A possibly-fractional number that may arrive as a blank spreadsheet cell. */
function numOr(fallback: number, min: number, max: number) {
  return z.union([z.literal(""), z.null(), z.undefined(), z.coerce.number()])
    .transform((v) => (isEmpty(v) ? fallback : Number(v)))
    .pipe(z.number().min(min).max(max));
}

/**
 * A tag list, as a real array or as text from a form or spreadsheet cell.
 * Splits on comma, semicolon or pipe — every export picks a different one — and
 * upper-cases so capability matching is case-insensitive.
 */
const tagList = z.union([z.string(), z.array(z.string()), z.null(), z.undefined()])
  .transform((v) => {
    if (!v) return [] as string[];
    const raw = Array.isArray(v) ? v : v.split(/[,;|]/);
    return [...new Set(raw.map((s) => String(s).trim().toUpperCase()).filter(Boolean))];
  });

const idList = z.union([z.array(objectId), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (!v) return [] as string[];
    const raw = Array.isArray(v) ? v : v.split(/[,;|]/);
    return [...new Set(raw.map((s) => String(s).trim()).filter(Boolean))];
  })
  .pipe(z.array(objectId));

/** An optional positive integer hint, where blank means "not set". */
const optionalInt = (min: number, max: number) =>
  z.union([z.coerce.number().int().min(min).max(max), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (isEmpty(v) ? null : Number(v)));

export const ROOM_TYPE_ENUM = z.enum(["CLASSROOM", "LECTURE", "LAB", "SEMINAR", "AUDITORIUM"]);
export const SESSION_KIND_ENUM = z.enum(["LECTURE", "LAB", "TUTORIAL"]);

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const timeSlotSchema = z.object({
  label: z.string().min(1, "Give the period a label"),
  start: hhmm,
  end: hhmm,
  order: z.coerce.number().int().min(0),
  kind: z.enum(["CLASS", "BREAK"]).default("CLASS"),
  active: boolish,
}).refine((v) => v.start < v.end, { message: "End time must be after start time", path: ["end"] });

export const roomSchema = z.object({
  code: z.string().min(1, "Room number is required"),
  block: z.string().min(1, "Block is required"),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1"),
  type: ROOM_TYPE_ENUM.default("CLASSROOM"),
  capabilities: tagList,
  active: boolish,
});

export const facultySchema = z.object({
  facultyId: z.string().min(1, "Faculty ID is required"),
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  department: z.string().optional().default(""),
  designation: z.string().optional(),
  maxHoursPerWeek: intOr(18, 1, 60),
  maxHoursPerDay: intOr(5, 1, 12),
  unavailability: z.array(z.object({
    day: z.coerce.number().int().min(0).max(6),
    slotOrder: z.coerce.number().int().min(0),
  })).default([]),
  active: boolish,
});

export const subjectSchema = z.object({
  code: z.string().min(2, "Subject code is required"),
  name: z.string().min(2, "Subject name is required"),
  department: z.string().min(1, "Department is required"),
  type: z.enum(["THEORY", "LAB", "TUTORIAL", "PROJECT"]).default("THEORY"),
  defaultDuration: intOr(1, 1, 3),
  credits: numOr(3, 0, 12),
  active: boolish,
});

export const sectionSchema = z.object({
  number: z.string().min(1, "Section number is required"),
  program: z.string().min(1, "Program is required"),
  semester: z.coerce.number().int().min(1).max(12),
  strength: z.coerce.number().int().min(1, "Enter the number of students"),
  homeRoom: optionalId,
  active: boolish,
});

export const assignmentSchema = z.object({
  section: objectId,
  subject: objectId,
  faculty: objectId,
  kind: SESSION_KIND_ENUM.default("LECTURE"),
  duration: intOr(1, 1, 3),
  requiredSessions: z.coerce.number().int()
    .min(1, "An assignment needs at least one session")
    .max(200, "That is more sessions than a semester can hold"),
  targetWeeklyFrequency: optionalInt(1, 14),
  roomSelection: z.enum(["AUTO", "FIXED", "ALLOWED_ROOMS"]).default("AUTO"),
  fixedRoom: optionalId,
  allowedRooms: idList,
  requiredRoomType: z.union([ROOM_TYPE_ENUM, z.literal("")]).optional()
    .transform((v) => (v ? v : undefined)),
  requiredCapabilities: tagList,
  active: boolish,
})
  .refine((v) => v.roomSelection !== "FIXED" || !!v.fixedRoom, {
    message: "Pick the room this assignment is pinned to",
    path: ["fixedRoom"],
  })
  .refine((v) => v.roomSelection !== "ALLOWED_ROOMS" || v.allowedRooms.length > 0, {
    message: "List at least one permitted room",
    path: ["allowedRooms"],
  });

export const calendarExceptionSchema = z.object({
  date: isoDate,
  endDate: z.union([isoDate, z.literal(""), z.null()]).optional()
    .transform((v) => (v ? v : undefined)),
  kind: z.enum(["HOLIDAY", "EVENT", "EXAM", "SPECIAL_WORKING"]),
  label: z.string().min(1, "Give this date a label"),
  followsWeekday: optionalInt(0, 6),
});

export const semesterSchema = z.object({
  name: z.string().min(1, "Name this semester"),
  academicYear: z.string().min(1),
  term: z.string().min(1),
  startDate: isoDate,
  endDate: isoDate,
  teachingWeekdays: z.array(z.coerce.number().int().min(0).max(6))
    .min(1, "Pick at least one teaching weekday"),
  exceptions: z.array(calendarExceptionSchema).default([]),
  active: boolish,
}).refine((v) => v.startDate <= v.endDate, {
  message: "The end date must fall on or after the start date",
  path: ["endDate"],
});

export const settingsSchema = z.object({
  institutionName: z.string().min(1),
  academicYear: z.string().min(1),
  term: z.string().min(1),
  workingDays: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Pick at least one working day"),
  maxHoursPerDayPerSection: z.coerce.number().int().min(1).max(12),
  maxConsecutiveHoursPerFaculty: z.coerce.number().int().min(1).max(8),
  allowSessionsAcrossBreak: z.union([z.boolean(), z.undefined(), z.null()])
    .transform((v) => v === true),
  maxSessionsPerAssignmentPerDay: intOr(1, 1, 4),
  preferAfternoonBreak: z.union([z.boolean(), z.undefined(), z.null()])
    .transform((v) => v !== false),
  afternoonWindowStart: hhmm.default("12:00"),
  afternoonWindowEnd: hhmm.default("15:00"),
  weights: z.object({
    sectionBalance: numOr(1, 0, 5),
    facultyBalance: numOr(1, 0, 5),
    afternoonBreak: numOr(1, 0, 5),
    subjectSpacing: numOr(1, 0, 5),
    consecutive: numOr(1, 0, 5),
    gaps: numOr(1, 0, 5),
    tailDistribution: numOr(1, 0, 5),
    roomFit: numOr(1, 0, 5),
  }).partial().optional(),
}).refine((v) => v.afternoonWindowStart < v.afternoonWindowEnd, {
  message: "The afternoon window must end after it starts",
  path: ["afternoonWindowEnd"],
});

export const generateSchema = z.object({
  name: z.string().min(1, "Name this timetable"),
  sections: z.array(objectId).optional(),
  semester: optionalId,
  seed: z.coerce.number().optional(),
  /** Create the timetable with no entries, for hand-building on the canvas. */
  empty: z.union([z.boolean(), z.undefined()]).transform((v) => v === true),
});

/** Manual move of a weekly-pattern cell on the Studio canvas. */
export const moveEntrySchema = z.object({
  entryId: objectId,
  day: z.coerce.number().int().min(0).max(6),
  slotOrder: z.coerce.number().int().min(0),
  room: optionalId,
});

/** Manual move of a dated session in the semester view. */
export const moveSessionSchema = z.object({
  sessionId: objectId,
  date: isoDate,
  slotOrder: z.coerce.number().int().min(0),
  room: optionalId,
});

/** An ad-hoc extra class. Never changes an assignment's requiredSessions. */
export const extraSessionSchema = z.object({
  date: isoDate,
  slotOrder: z.coerce.number().int().min(0),
  duration: intOr(1, 1, 3),
  section: objectId,
  subject: objectId,
  faculty: objectId,
  room: objectId,
  kind: SESSION_KIND_ENUM.default("LECTURE"),
  reason: z.string().min(1, "Say why this extra class is being added"),
});

export const importCommitSchema = z.object({
  resource: z.enum(["rooms", "faculty", "subjects", "sections", "assignments"]),
  rows: z.array(z.record(z.any())).min(1, "Nothing to import"),
});
