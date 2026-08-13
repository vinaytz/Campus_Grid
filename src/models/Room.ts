import { Schema, model, models, type Model } from "mongoose";

export interface IRoom {
  code: string;      // "301"
  block: string;     // "B"
  capacity: number;  // seats — hard-checked against section strength
  type: "LECTURE" | "LAB" | "SEMINAR" | "AUDITORIUM";
  active: boolean;
}

const RoomSchema = new Schema<IRoom>(
  {
    code: { type: String, required: true, trim: true },
    block: { type: String, required: true, trim: true, uppercase: true },
    capacity: { type: Number, required: true, min: 1 },
    type: {
      type: String,
      enum: ["LECTURE", "LAB", "SEMINAR", "AUDITORIUM"],
      default: "LECTURE",
    },
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
