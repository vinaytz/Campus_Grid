import { Schema, model, models, type Model } from "mongoose";
import type { Types } from "mongoose";

export interface ISection {
  universityId?: Types.ObjectId;
  number: string;      // "2403"
  program: string;     // "B.Tech CSE"
  semester: number;
  strength: number;    // students — drives the room capacity constraint
  homeRoom?: string;   // optional preferred room id
  active: boolean;
}

const SectionSchema = new Schema<ISection>(
  {
    universityId: { type: Schema.Types.ObjectId, ref: "University", index: true },
    number: { type: String, required: true, trim: true },
    program: { type: String, required: true, trim: true },
    semester: { type: Number, required: true, min: 1, max: 12 },
    strength: { type: Number, required: true, min: 1 },
    homeRoom: { type: Schema.Types.ObjectId, ref: "Room" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const SectionModel = (models.Section as Model<ISection>) || model<ISection>("Section", SectionSchema);
SectionSchema.index({ universityId: 1, number: 1 }, { unique: true });
export default SectionModel;
