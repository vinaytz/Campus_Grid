import { Schema, model, models, type Model, type Types } from "mongoose";

/** One placed session. slotOrder is the *starting* slot; it spans `duration`. */
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

export interface ITimetable {
  name: string;
  academicYear: string;
  term: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  /** DocumentArray so route handlers can use .id() and .pull() on subdocs. */
  entries: Types.DocumentArray<IEntry>;
  stats: {
    requested: number;
    placed: number;
    unplaced: { assignment: string; reason: string }[];
    generatedAt?: Date;
    durationMs?: number;
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

const TimetableSchema = new Schema<ITimetable>(
  {
    name: { type: String, required: true, trim: true },
    academicYear: { type: String, default: "2025-26" },
    term: { type: String, default: "Odd" },
    status: { type: String, enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], default: "DRAFT" },
    entries: { type: [EntrySchema], default: [] },
    stats: {
      requested: { type: Number, default: 0 },
      placed: { type: Number, default: 0 },
      unplaced: { type: [{ assignment: String, reason: String, _id: false }], default: [] },
      generatedAt: Date,
      durationMs: Number,
    },
  },
  { timestamps: true }
);

TimetableSchema.index({ status: 1, updatedAt: -1 });

const TimetableModel = (models.Timetable as Model<ITimetable>) || model<ITimetable>("Timetable", TimetableSchema);
export default TimetableModel;
