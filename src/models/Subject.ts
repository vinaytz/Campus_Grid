import { Schema, model, models, type Model } from "mongoose";
import type { Types } from "mongoose";

export interface ISubject {
  universityId?: Types.ObjectId;
  code: string;   // "ECE281"
  name: string;   // "Introduction to IoT"
  department: string;
  /** THEORY vs LAB drives the default room kind when an assignment doesn't override. */
  type: "THEORY" | "LAB" | "TUTORIAL" | "PROJECT";
  /** Default periods per session; an assignment may override it. */
  defaultDuration: 1 | 2 | 3;
  credits: number;
  active: boolean;
}

const SubjectSchema = new Schema<ISubject>(
  {
    universityId: { type: Schema.Types.ObjectId, ref: "University", index: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["THEORY", "LAB", "TUTORIAL", "PROJECT"],
      default: "THEORY",
    },
    defaultDuration: { type: Number, enum: [1, 2, 3], default: 1 },
    credits: { type: Number, default: 3, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SubjectSchema.index({ name: "text", code: "text" });
SubjectSchema.index({ universityId: 1, code: 1 }, { unique: true });

const SubjectModel = (models.Subject as Model<ISubject>) || model<ISubject>("Subject", SubjectSchema);
export default SubjectModel;
