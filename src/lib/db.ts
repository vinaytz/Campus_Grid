import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not set. Copy .env.example to .env and fill it in.");
}

/**
 * Next dev-mode hot reload re-evaluates modules, so the connection is cached on
 * globalThis to avoid opening a new pool on every request.
 */
type Cache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  legacyIndexes?: Promise<void>;
};
const globalForMongoose = globalThis as unknown as { _mongoose?: Cache };
const cached: Cache = globalForMongoose._mongoose ?? { conn: null, promise: null };
globalForMongoose._mongoose = cached;

/**
 * Unique indexes from before multi-university support. They make a faculty ID,
 * section number or room unique across ALL universities, so one university's
 * upload collides with another's data. The per-university replacements are
 * declared on the models.
 */
const LEGACY_UNIQUE_INDEXES: Record<string, string[]> = {
  timeslots: ["order_1"],
  rooms: ["block_1_code_1"],
  faculties: ["facultyId_1"],
  subjects: ["code_1"],
  sections: ["number_1"],
  assignments: ["section_1_subject_1_kind_1"],
};

export async function dropLegacyIndexes(db: NonNullable<typeof mongoose.connection.db>) {
  for (const [collectionName, names] of Object.entries(LEGACY_UNIQUE_INDEXES)) {
    const existing = await db.collection(collectionName).listIndexes().toArray().catch(() => []);
    for (const name of names) {
      if (existing.some((index) => index.name === name)) {
        await db.collection(collectionName).dropIndex(name);
      }
    }
  }
}

export async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI!, {
      bufferCommands: false,
      maxPoolSize: 10,
    });
  }
  cached.conn = await cached.promise;
  const db = cached.conn.connection.db;
  if (db && !cached.legacyIndexes) {
    cached.legacyIndexes = dropLegacyIndexes(db).catch((error) => {
      cached.legacyIndexes = undefined;
      console.error("[db] could not drop legacy indexes", error);
    });
  }
  await cached.legacyIndexes;
  return cached.conn;
}

/** Registers every model so `populate()` works regardless of import order. */
export async function connectAndRegister() {
  const conn = await connectDB();
  await Promise.all([
    import("@/models/User"),
    import("@/models/University"),
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
