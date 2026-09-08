import { Schema, model, models, type Model } from "mongoose";
import type { Types } from "mongoose";

/**
 * Single-document collection holding institution-wide scheduling rules.
 *
 * Note what is *not* here: a universal lunch break. There is no time of day at
 * which every section is idle. Instead `afternoonWindow*` describes a window in
 * which each section should ideally get at least one free period — a soft
 * objective the optimiser pursues per section, so 2401 may be free at 12:00 and
 * 2403 at 14:00. See scheduler/score.ts.
 */
export interface ISettings {
  universityId?: Types.ObjectId;
  institutionName: string;
  academicYear: string;
  term: string;
  /** Fallback teaching weekdays when no semester calendar is selected. */
  workingDays: number[];            // 0=Sun … 6=Sat

  maxHoursPerDayPerSection: number;
  maxConsecutiveHoursPerFaculty: number;
  allowSessionsAcrossBreak: boolean; // may a 2hr lab straddle a real break slot?

  /** Hard cap on how often one assignment may recur on a single calendar day. */
  maxSessionsPerAssignmentPerDay: number;

  /** Soft: preferred free-period window, per section. */
  preferAfternoonBreak: boolean;
  afternoonWindowStart: string;      // "12:00"
  afternoonWindowEnd: string;        // "15:00"

  /** Relative weights for the soft objectives. Higher = matters more. */
  weights: {
    sectionBalance: number;
    facultyBalance: number;
    afternoonBreak: number;
    subjectSpacing: number;
    consecutive: number;
    gaps: number;
    tailDistribution: number;
    roomFit: number;
  };
}

const SettingsSchema = new Schema<ISettings>(
  {
    universityId: { type: Schema.Types.ObjectId, ref: "University", index: true },
    institutionName: { type: String, default: "Institute of Technology" },
    academicYear: { type: String, default: "2025-26" },
    term: { type: String, default: "Odd" },
    workingDays: { type: [Number], default: [1, 2, 3, 4, 5] },

    maxHoursPerDayPerSection: { type: Number, default: 7 },
    maxConsecutiveHoursPerFaculty: { type: Number, default: 3 },
    allowSessionsAcrossBreak: { type: Boolean, default: false },

    maxSessionsPerAssignmentPerDay: { type: Number, default: 1, min: 1, max: 4 },

    preferAfternoonBreak: { type: Boolean, default: true },
    afternoonWindowStart: { type: String, default: "12:00" },
    afternoonWindowEnd: { type: String, default: "15:00" },

    weights: {
      sectionBalance: { type: Number, default: 1 },
      facultyBalance: { type: Number, default: 1 },
      afternoonBreak: { type: Number, default: 1 },
      subjectSpacing: { type: Number, default: 1 },
      consecutive: { type: Number, default: 1 },
      gaps: { type: Number, default: 1 },
      tailDistribution: { type: Number, default: 1 },
      roomFit: { type: Number, default: 1 },
    },
  },
  { timestamps: true }
);

const SettingsModel =
  (models.Settings as Model<ISettings>) || model<ISettings>("Settings", SettingsSchema);
export default SettingsModel;
