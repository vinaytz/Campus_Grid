import { Schema, model, models, type Model, type Types } from "mongoose";

/**
 * A timetable is stored in two layers.
 *
 *   entries[]  — the recurring WEEKLY PATTERN (day-of-week + starting period).
 *                This is what the Studio canvas edits and what the "typical
 *                week" views render. It is a template, not the deliverable.
 *
 *   sessions[] — the DATED SEMESTER SESSIONS produced by expanding the pattern
 *                across the semester calendar and reconciling each assignment to
 *                exactly its requiredSessions. This is the deliverable, and the
 *                thing the independent validator checks before publishing.
 *
 * Ad-hoc/extra classes live in sessions[] with type "EXTRA". They never count
 * towards an assignment's requiredSessions.
 */

/** One cell of the weekly pattern. slotOrder is the *starting* period. */
export interface IEntry {
  assignment: any;
  day: number;
  slotOrder: number;
  duration: number;
  section: any;
  subject: any;
  faculty: any;
  room: any;
  kind: "LECTURE" | "LAB" | "TUTORIAL";
  locked: boolean; // survives regeneration
}

/** One real class, on one real date. */
export interface ISession {
  assignment?: any;          // absent for a standalone EXTRA class
  date: string;              // "2025-08-11" — ISO yyyy-mm-dd, timezone-proof
  day: number;               // weekday of `date`, denormalised for grid rendering
  slotOrder: number;
  duration: number;
  section: any;
  subject: any;
  faculty: any;
  room: any;
  kind: "LECTURE" | "LAB" | "TUTORIAL";
  type: "REGULAR" | "EXTRA";
  locked: boolean;
  /** Why an EXTRA class exists, or why a REGULAR one was moved. */
  reason?: string;
}

export interface IPerAssignment {
  assignment: any;
  label: string;
  required: number;
  scheduled: number;
}

export interface IViolation {
  rule: string;
  severity: "HARD" | "SOFT";
  message: string;
  date?: string;
  slotOrder?: number;
  refs?: string[];
}

export interface ITimetable {
  name: string;
  semester?: any;
  academicYear: string;
  term: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  /** DocumentArray so route handlers can use .id() and .pull() on subdocs. */
  entries: Types.DocumentArray<IEntry>;
  sessions: Types.DocumentArray<ISession>;
  stats: {
    /** Total sessions the assignments asked for. */
    requested: number;
    /** Dated REGULAR sessions actually on the timetable. */
    scheduled: number;
    /** Cells in the weekly pattern. */
    patternPlaced: number;
    perAssignment: IPerAssignment[];
    unscheduled: { assignment: string; reason: string }[];
    softScore: number;
    softBreakdown: Record<string, number>;
    warnings: string[];
    feasible: boolean;
    generatedAt?: Date;
    durationMs?: number;
  };
  /** Result of the last independent validation run. Publishing reads this. */
  validation: {
    ranAt?: Date;
    hardViolations: IViolation[];
    softViolations: IViolation[];
    countMismatches: { assignment: string; required: number; scheduled: number }[];
    publishable: boolean;
  };
}

const EntrySchema = new Schema<IEntry>(
  {
    assignment: { type: Schema.Types.ObjectId, ref: "Assignment", required: true },
    day: { type: Number, required: true },
    slotOrder: { type: Number, required: true },
    duration: { type: Number, required: true, default: 1 },
    section: { type: Schema.Types.ObjectId, ref: "Section", required: true },
    subject: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    faculty: { type: Schema.Types.ObjectId, ref: "Faculty", required: true },
    room: { type: Schema.Types.ObjectId, ref: "Room", required: true },
    kind: { type: String, enum: ["LECTURE", "LAB", "TUTORIAL"], default: "LECTURE" },
    locked: { type: Boolean, default: false },
  },
  { _id: true }
);

const SessionSchema = new Schema<ISession>(
  {
    assignment: { type: Schema.Types.ObjectId, ref: "Assignment" },
    date: { type: String, required: true },
    day: { type: Number, required: true },
    slotOrder: { type: Number, required: true },
    duration: { type: Number, required: true, default: 1 },
    section: { type: Schema.Types.ObjectId, ref: "Section", required: true },
    subject: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    faculty: { type: Schema.Types.ObjectId, ref: "Faculty", required: true },
    room: { type: Schema.Types.ObjectId, ref: "Room", required: true },
    kind: { type: String, enum: ["LECTURE", "LAB", "TUTORIAL"], default: "LECTURE" },
    type: { type: String, enum: ["REGULAR", "EXTRA"], default: "REGULAR" },
    locked: { type: Boolean, default: false },
    reason: { type: String, trim: true },
  },
  { _id: true }
);

const ViolationSchema = new Schema<IViolation>(
  {
    rule: String,
    severity: { type: String, enum: ["HARD", "SOFT"] },
    message: String,
    date: String,
    slotOrder: Number,
    refs: [String],
  },
  { _id: false }
);

const TimetableSchema = new Schema<ITimetable>(
  {
    name: { type: String, required: true, trim: true },
    semester: { type: Schema.Types.ObjectId, ref: "Semester" },
    academicYear: { type: String, default: "2025-26" },
    term: { type: String, default: "Odd" },
    status: { type: String, enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], default: "DRAFT" },
    entries: { type: [EntrySchema], default: [] },
    sessions: { type: [SessionSchema], default: [] },
    stats: {
      requested: { type: Number, default: 0 },
      scheduled: { type: Number, default: 0 },
      patternPlaced: { type: Number, default: 0 },
      perAssignment: {
        type: [{
          assignment: { type: Schema.Types.ObjectId, ref: "Assignment" },
          label: String,
          required: Number,
          scheduled: Number,
          _id: false,
        }],
        default: [],
      },
      unscheduled: { type: [{ assignment: String, reason: String, _id: false }], default: [] },
      softScore: { type: Number, default: 0 },
      softBreakdown: { type: Schema.Types.Mixed, default: {} },
      warnings: { type: [String], default: [] },
      feasible: { type: Boolean, default: false },
      generatedAt: Date,
      durationMs: Number,
    },
    validation: {
      ranAt: Date,
      hardViolations: { type: [ViolationSchema], default: [] },
      softViolations: { type: [ViolationSchema], default: [] },
      countMismatches: {
        type: [{ assignment: String, required: Number, scheduled: Number, _id: false }],
        default: [],
      },
      publishable: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

TimetableSchema.index({ status: 1, updatedAt: -1 });

const TimetableModel =
  (models.Timetable as Model<ITimetable>) || model<ITimetable>("Timetable", TimetableSchema);
export default TimetableModel;
