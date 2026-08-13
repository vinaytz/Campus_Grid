import { Schema, model, models, type Model } from "mongoose";

/** Single-document collection holding institution-wide scheduling rules. */
export interface ISettings {
  institutionName: string;
  academicYear: string;
  term: string;
  workingDays: number[];            // 0=Sun … 6=Sat
  maxHoursPerDayPerSection: number;
  maxConsecutiveHoursPerFaculty: number;
  allowSessionsAcrossBreak: boolean; // may a 2hr lab straddle lunch?
}

const SettingsSchema = new Schema<ISettings>(
  {
    institutionName: { type: String, default: "Institute of Technology" },
    academicYear: { type: String, default: "2025-26" },
    term: { type: String, default: "Odd" },
    workingDays: { type: [Number], default: [1, 2, 3, 4, 5] },
    maxHoursPerDayPerSection: { type: Number, default: 7 },
    maxConsecutiveHoursPerFaculty: { type: Number, default: 3 },
    allowSessionsAcrossBreak: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const SettingsModel = (models.Settings as Model<ISettings>) || model<ISettings>("Settings", SettingsSchema);
export default SettingsModel;
