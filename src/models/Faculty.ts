import { Schema, model, models, type Model } from "mongoose";

/** Blocked windows a faculty member cannot teach (day + slot order). */
export interface IUnavailability { day: number; slotOrder: number }

export interface IFaculty {
  facultyId: string;   // "23314"
  name: string;        // "Praveen Malik"
  email?: string;
  department: string;
  designation?: string;
  maxHoursPerWeek: number;
  maxHoursPerDay: number;
  unavailability: IUnavailability[];
  active: boolean;
}

const FacultySchema = new Schema<IFaculty>(
  {
    facultyId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    department: { type: String, required: true, trim: true },
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

const FacultyModel = (models.Faculty as Model<IFaculty>) || model<IFaculty>("Faculty", FacultySchema);
export default FacultyModel;
