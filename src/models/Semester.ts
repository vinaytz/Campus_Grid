import { Schema, model, models, type Model } from "mongoose";

/**
 * The academic calendar a timetable is generated against.
 *
 * Candidate teaching days are derived from [startDate, endDate] filtered to
 * `teachingWeekdays`, then adjusted by `exceptions`:
 *
 *   HOLIDAY | EVENT | EXAM   → that date carries no regular classes
 *   SPECIAL_WORKING         → that date IS a teaching day even if its weekday
 *                             isn't in teachingWeekdays (a Saturday run as a
 *                             Monday, say), optionally following another
 *                             weekday's pattern via `followsWeekday`
 *
 * Nothing assumes Mon–Fri is usable. The admin's exception list is authoritative.
 */
export type ExceptionKind = "HOLIDAY" | "EVENT" | "EXAM" | "SPECIAL_WORKING";

export interface ICalendarException {
  /** Inclusive start. Stored as an ISO yyyy-mm-dd string to stay timezone-proof. */
  date: string;
  /** Inclusive end for multi-day blocks; defaults to `date`. */
  endDate?: string;
  kind: ExceptionKind;
  label: string;
  /** SPECIAL_WORKING only: run this date on another weekday's pattern (0=Sun…6=Sat). */
  followsWeekday?: number | null;
}

export interface ISemester {
  name: string;
  academicYear: string;
  term: string;
  startDate: string;          // "2025-07-21"
  endDate: string;            // "2025-11-14"
  teachingWeekdays: number[]; // 0=Sun … 6=Sat
  exceptions: ICalendarException[];
  active: boolean;
}

const ExceptionSchema = new Schema<ICalendarException>(
  {
    date: { type: String, required: true },
    endDate: { type: String },
    kind: {
      type: String,
      enum: ["HOLIDAY", "EVENT", "EXAM", "SPECIAL_WORKING"],
      required: true,
    },
    label: { type: String, required: true, trim: true },
    followsWeekday: { type: Number, min: 0, max: 6, default: null },
  },
  { _id: true }
);

const SemesterSchema = new Schema<ISemester>(
  {
    name: { type: String, required: true, trim: true },
    academicYear: { type: String, default: "2025-26" },
    term: { type: String, default: "Odd" },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    teachingWeekdays: { type: [Number], default: [1, 2, 3, 4, 5] },
    exceptions: { type: [ExceptionSchema], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const SemesterModel =
  (models.Semester as Model<ISemester>) || model<ISemester>("Semester", SemesterSchema);
export default SemesterModel;
