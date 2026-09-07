import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not set. Copy .env.example to .env and fill it in.");
}

/**
 * Next dev-mode hot reload re-evaluates modules, so the connection is cached on
 * globalThis to avoid opening a new pool on every request.
 */
type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const globalForMongoose = globalThis as unknown as { _mongoose?: Cache };
const cached: Cache = globalForMongoose._mongoose ?? { conn: null, promise: null };
globalForMongoose._mongoose = cached;

export async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI!, {
      bufferCommands: false,
      maxPoolSize: 10,
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

/** Registers every model so `populate()` works regardless of import order. */
export async function connectAndRegister() {
  const conn = await connectDB();
  await Promise.all([
    import("@/models/User"),
    import("@/models/Settings"),
    import("@/models/TimeSlot"),
    import("@/models/Room"),
    import("@/models/Faculty"),
    import("@/models/Subject"),
    import("@/models/Section"),
    import("@/models/Assignment"),
    import("@/models/Semester"),
    import("@/models/Timetable"),
  ]);
  return conn;
}
