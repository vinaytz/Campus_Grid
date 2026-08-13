import { Schema, model, models, type Model } from "mongoose";

export interface ISubject {
  code: string;   // "ECE281"
  name: string;   // "Introduction to IoT"
  department: string;
  credits: number;
  active: boolean;
}

const SubjectSchema = new Schema<ISubject>(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    credits: { type: Number, default: 3, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SubjectSchema.index({ name: "text", code: "text" });

const SubjectModel = (models.Subject as Model<ISubject>) || model<ISubject>("Subject", SubjectSchema);
export default SubjectModel;
