import mongoose, { Schema, model, models, type Model } from "mongoose";

export interface IUser {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: "PLATFORM_ADMIN" | "UNIVERSITY_ADMIN" | "ADMIN" | "COORDINATOR" | "VIEWER";
  universityId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["PLATFORM_ADMIN", "UNIVERSITY_ADMIN", "ADMIN", "COORDINATOR", "VIEWER"],
      default: "UNIVERSITY_ADMIN",
    },
    universityId: { type: Schema.Types.ObjectId, ref: "University", default: null, index: true },
  },
  { timestamps: true }
);

const UserModel = (models.User as Model<IUser>) || model<IUser>("User", UserSchema);
export default UserModel;
