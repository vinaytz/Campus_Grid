import mongoose, { Schema, model, models, type Model } from "mongoose";

export interface IUser {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: "ADMIN" | "COORDINATOR" | "VIEWER";
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["ADMIN", "COORDINATOR", "VIEWER"], default: "ADMIN" },
  },
  { timestamps: true }
);

const UserModel = (models.User as Model<IUser>) || model<IUser>("User", UserSchema);
export default UserModel;
