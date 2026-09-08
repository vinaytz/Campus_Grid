import { Schema, model, models, type Model } from "mongoose";
import type { Types } from "mongoose";

/** Blocked windows a faculty member cannot teach (day + slot order). */
export interface IUnavailability { day: number; slotOrder: number }

export interface IFaculty {
  universityId?: Types.ObjectId;
  facultyId: string;   // "23314" — the institution's own uid
  name: string;        // "Praveen Malik"
  email?: string;
  /** Optional: plenty of visiting//guest staff have no home department. */
  department?: string;
  designation?: string;
  maxHoursPerWeek: number;
  maxHoursPerDay: number;
  unavailability: IUnavailability[];
  active: boolean;
}

const FacultySchema = new Schema<IFaculty>(
  {
    universityId: { type: Schema.Types.ObjectId, ref: "University", index: true },
    facultyId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    department: { type: String, trim: true, default: "" },
    designation: { type: String, trim: true },
    maxHoursPerWeek: { type: Number, default: 18 },
    maxHoursPerDay: { type: Number, default: 5 },
    unavailability: {
      type: [{ day: Number, slotOrder: Number, _id: false }],
      default: [],
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

FacultySchema.index({ name: "text", facultyId: "text" });
FacultySchema.index({ universityId: 1, facultyId: 1 }, { unique: true });

const FacultyModel = (models.Faculty as Model<IFaculty>) || model<IFaculty>("Faculty", FacultySchema);
export default FacultyModel;
