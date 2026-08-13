import { Schema, model, models, type Model } from "mongoose";

/**
 * The join that drives everything: this faculty teaches this subject to this
 * section, N times a week, each session `duration` slots long.
 *
 * A 3-credit theory course is usually { sessionsPerWeek: 3, duration: 1 }.
 * A weekly 2-hour lab is { sessionsPerWeek: 1, duration: 2, kind: "LAB" }.
 */
export interface IAssignment {
  section: any;
  subject: any;
  faculty: any;
  kind: "LECTURE" | "LAB" | "TUTORIAL";
  duration: 1 | 2 | 3;        // contiguous slots per session
  sessionsPerWeek: number;
  requiredRoomType?: "LECTURE" | "LAB" | "SEMINAR" | "AUDITORIUM";
  fixedRoom?: any;            // pin to a room (e.g. a specific hardware lab)
  active: boolean;
}

const AssignmentSchema = new Schema<IAssignment>(
  {
    section: { type: Schema.Types.ObjectId, ref: "Section", required: true },
    subject: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    faculty: { type: Schema.Types.ObjectId, ref: "Faculty", required: true },
    kind: { type: String, enum: ["LECTURE", "LAB", "TUTORIAL"], default: "LECTURE" },
    duration: { type: Number, enum: [1, 2, 3], default: 1 },
    sessionsPerWeek: { type: Number, default: 3, min: 1, max: 10 },
    requiredRoomType: {
      type: String,
      enum: ["LECTURE", "LAB", "SEMINAR", "AUDITORIUM"],
    },
    fixedRoom: { type: Schema.Types.ObjectId, ref: "Room" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

AssignmentSchema.index({ section: 1, subject: 1, kind: 1 }, { unique: true });

const AssignmentModel = (models.Assignment as Model<IAssignment>) || model<IAssignment>("Assignment", AssignmentSchema);
export default AssignmentModel;
