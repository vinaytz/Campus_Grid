import { Schema, model, models, type Model } from "mongoose";
import type { Types } from "mongoose";

/**
 * A period in the daily bell schedule, e.g. 09:00–09:50.
 * `order` defines adjacency: slots order n and n+1 are contiguous, which is
 * what lets the scheduler place 2hr and 3hr sessions in one unbroken run.
 * A slot with kind BREAK (lunch, assembly) is never assigned a class.
 */
export interface ITimeSlot {
  universityId?: Types.ObjectId;
  label: string;
  start: string; // "09:00" 24h
  end: string;   // "09:50"
  order: number;
  kind: "CLASS" | "BREAK";
  active: boolean;
}

const TimeSlotSchema = new Schema<ITimeSlot>(
  {
    universityId: { type: Schema.Types.ObjectId, ref: "University", index: true },
    label: { type: String, required: true, trim: true },
    start: { type: String, required: true },
    end: { type: String, required: true },
    order: { type: Number, required: true },
    kind: { type: String, enum: ["CLASS", "BREAK"], default: "CLASS" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const TimeSlotModel = (models.TimeSlot as Model<ITimeSlot>) || model<ITimeSlot>("TimeSlot", TimeSlotSchema);
export default TimeSlotModel;
