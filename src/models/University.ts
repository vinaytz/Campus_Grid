import { Schema, model, models, type Model } from "mongoose";

export interface IUniversity {
  name: string;
  code: string;
  /** Public, stable identifier. Existing records can safely fall back to code. */
  slug?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UniversitySchema = new Schema<IUniversity>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    slug: { type: String, trim: true, lowercase: true, unique: true, sparse: true, index: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const UniversityModel =
  (models.University as Model<IUniversity>) || model<IUniversity>("University", UniversitySchema);

export default UniversityModel;
