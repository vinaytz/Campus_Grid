import { Schema, model, models, type Model } from "mongoose";
import type { Types } from "mongoose";

/**
 * The join that drives everything: this faculty member teaches this subject to
 * this section, exactly `requiredSessions` times across the semester, each
 * session `duration` contiguous periods long.
 *
 *   Faculty + Subject + Section + requiredSessions + duration + room rules
 *
 * `requiredSessions` is an absolute semester total, not a weekly rate. An
 * assignment with requiredSessions: 40 must end up with exactly 40 dated
 * sessions in the published timetable — not 39, not 41. Weekly counts are free
 * to vary (3, 3, 4, … 2) as long as the total lands.
 *
 * `targetWeeklyFrequency` is a *non-binding* distribution hint used only to size
 * the recurring weekly pattern before it is expanded against the calendar. It
 * never overrides requiredSessions.
 */
export type RoomSelection = "AUTO" | "FIXED" | "ALLOWED_ROOMS";

export interface IAssignment {
  universityId?: Types.ObjectId;
  section: any;
  subject: any;
  faculty: any;
  kind: "LECTURE" | "LAB" | "TUTORIAL";
  duration: 1 | 2 | 3;
  /** Exact number of sessions that must appear in the final semester timetable. */
  requiredSessions: number;
  /** Optional, non-binding weekly distribution hint. */
  targetWeeklyFrequency?: number | null;

  /** How the scheduler is allowed to pick a room. */
  roomSelection: RoomSelection;
  fixedRoom?: any;              // roomSelection === "FIXED"
  allowedRooms: any[];          // roomSelection === "ALLOWED_ROOMS"
  requiredRoomType?: "CLASSROOM" | "LECTURE" | "LAB" | "SEMINAR" | "AUDITORIUM";
  /** Tags the room must have, e.g. ["BYOD"] or ["COMPUTER","PROJECTOR"]. */
  requiredCapabilities: string[];

  active: boolean;
}

const AssignmentSchema = new Schema<IAssignment>(
  {
    universityId: { type: Schema.Types.ObjectId, ref: "University", index: true },
    section: { type: Schema.Types.ObjectId, ref: "Section", required: true },
    subject: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    faculty: { type: Schema.Types.ObjectId, ref: "Faculty", required: true },
    kind: { type: String, enum: ["LECTURE", "LAB", "TUTORIAL"], default: "LECTURE" },
    duration: { type: Number, enum: [1, 2, 3], default: 1 },
    requiredSessions: { type: Number, required: true, min: 1, max: 200 },
    targetWeeklyFrequency: { type: Number, min: 1, max: 14, default: null },

    roomSelection: {
      type: String,
      enum: ["AUTO", "FIXED", "ALLOWED_ROOMS"],
      default: "AUTO",
    },
    fixedRoom: { type: Schema.Types.ObjectId, ref: "Room" },
    allowedRooms: { type: [{ type: Schema.Types.ObjectId, ref: "Room" }], default: [] },
    requiredRoomType: {
      type: String,
      enum: ["CLASSROOM", "LECTURE", "LAB", "SEMINAR", "AUDITORIUM"],
    },
    requiredCapabilities: { type: [String], default: [] },

    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

AssignmentSchema.index({ universityId: 1, section: 1, subject: 1, kind: 1 }, { unique: true });

const AssignmentModel =
  (models.Assignment as Model<IAssignment>) || model<IAssignment>("Assignment", AssignmentSchema);
export default AssignmentModel;
