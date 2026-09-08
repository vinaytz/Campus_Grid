/**
 * Resets the configured database and bootstraps the single platform owner.
 *
 * University data is intentionally created later by the Platform Admin through
 * the platform dashboard. This keeps the first-run role flow unambiguous.
 */
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../src/models/User";
import University from "../src/models/University";
import Settings from "../src/models/Settings";
import TimeSlot from "../src/models/TimeSlot";
import Room from "../src/models/Room";
import Faculty from "../src/models/Faculty";
import Subject from "../src/models/Subject";
import Section from "../src/models/Section";
import Assignment from "../src/models/Assignment";
import Timetable from "../src/models/Timetable";
import Semester from "../src/models/Semester";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing — copy .env.example to .env first.");
  await mongoose.connect(uri);
  console.log("→ connected");

  const obsoleteIndexes: Record<string, string[]> = {
    timeslots: ["order_1"],
    rooms: ["block_1_code_1"],
    faculties: ["facultyId_1"],
    subjects: ["code_1"],
    sections: ["number_1"],
    assignments: ["section_1_subject_1_kind_1"],
  };
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection did not expose a database.");
  for (const [collectionName, names] of Object.entries(obsoleteIndexes)) {
    const collection = db.collection(collectionName);
    const indexes = await collection.listIndexes().toArray();
    for (const name of names) {
      if (indexes.some((index) => index.name === name)) await collection.dropIndex(name);
    }
  }

  await Promise.all([
    User.deleteMany({}),
    University.deleteMany({}),
    Settings.deleteMany({}),
    TimeSlot.deleteMany({}),
    Room.deleteMany({}),
    Faculty.deleteMany({}),
    Subject.deleteMany({}),
    Section.deleteMany({}),
    Assignment.deleteMany({}),
    Timetable.deleteMany({}),
    Semester.deleteMany({}),
  ]);

  await User.create({
    name: "Platform Administrator",
    email: (process.env.SEED_ADMIN_EMAIL ?? "platform@campus-grid.local").toLowerCase(),
    passwordHash: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!", 12),
    role: "PLATFORM_ADMIN",
  });

  console.log("→ bootstrapped Platform Admin; no universities or university admins created");
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
