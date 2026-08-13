import { Schema, model, models, type Model } from "mongoose";

export interface ISection {
  number: string;      // "2403"
  program: string;     // "B.Tech CSE"
  semester: number;
  strength: number;    // students — drives the room capacity constraint
  homeRoom?: string;   // optional preferred room id
  active: boolean;
}

const SectionSchema = new Schema<ISection>(
  {
    number: { type: String, required: true, unique: true, trim: true },
    program: { type: String, required: true, trim: true },
    semester: { type: Number, required: true, min: 1, max: 12 },
    strength: { type: Number, required: true, min: 1 },
    homeRoom: { type: Schema.Types.ObjectId, ref: "Room" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const SectionModel = (models.Section as Model<ISection>) || model<ISection>("Section", SectionSchema);
export default SectionModel;
