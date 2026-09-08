import { Schema, model, models, type Model } from "mongoose";

export interface IUniversity {
  name: string;
  code: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UniversitySchema = new Schema<IUniversity>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const UniversityModel =
  (models.University as Model<IUniversity>) || model<IUniversity>("University", UniversitySchema);

export default UniversityModel;
