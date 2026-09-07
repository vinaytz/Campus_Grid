import { Schema, model, models, type Model } from "mongoose";

/**
 * A bookable space.
 *
 * `type` is the coarse kind; `capabilities` are free-form tags (BYOD, PROJECTOR,
 * COMPUTER, …). The scheduler never hardcodes a tag name — an assignment lists
 * the capabilities it needs and the room must be a superset. That means a new
 * facility is a data change, not a code change.
 */
export interface IRoom {
  code: string;      // "301"
  block: string;     // "B"
  capacity: number;  // seats — hard-checked against section strength
  type: "CLASSROOM" | "LECTURE" | "LAB" | "SEMINAR" | "AUDITORIUM";
  capabilities: string[];
  active: boolean;
}

const RoomSchema = new Schema<IRoom>(
  {
    code: { type: String, required: true, trim: true },
    block: { type: String, required: true, trim: true, uppercase: true },
    capacity: { type: Number, required: true, min: 1 },
    type: {
      type: String,
      enum: ["CLASSROOM", "LECTURE", "LAB", "SEMINAR", "AUDITORIUM"],
      default: "CLASSROOM",
    },
    capabilities: { type: [String], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

RoomSchema.index({ block: 1, code: 1 }, { unique: true });
RoomSchema.virtual("displayName").get(function () {
  return `${this.block}-${this.code}`;
});
RoomSchema.set("toJSON", { virtuals: true });

const RoomModel = (models.Room as Model<IRoom>) || model<IRoom>("Room", RoomSchema);
export default RoomModel;
