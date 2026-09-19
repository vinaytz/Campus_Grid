/**
 * Removes one university with its admin logins and all of its data, so the
 * same code and admin email can be set up again from the Platform Admin page.
 *
 *   npx tsx scripts/delete-university.ts <CODE>            dry run, shows what would go
 *   npx tsx scripts/delete-university.ts <CODE> --confirm  saves a backup, then deletes
 */
import "dotenv/config";
import mongoose from "mongoose";
import { mkdirSync, writeFileSync } from "node:fs";

const TENANT_COLLECTIONS = [
  "users", "rooms", "faculties", "subjects", "sections", "assignments",
  "timeslots", "semesters", "settings", "timetables",
];

async function main() {
  const code = process.argv[2]?.trim().toUpperCase();
  const confirm = process.argv.includes("--confirm");
  if (!code || code.startsWith("--")) {
    throw new Error("Usage: npx tsx scripts/delete-university.ts <CODE> [--confirm]");
  }
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI missing — check .env.");

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection did not expose a database.");

  const university = await db.collection("universities").findOne({ code });
  if (!university) throw new Error(`No university with code ${code}.`);

  const filter = { universityId: university._id };
  const backup: Record<string, unknown[]> = { universities: [university] };
  for (const name of TENANT_COLLECTIONS) {
    backup[name] = await db.collection(name).find(filter).toArray();
  }

  console.log(`${university.name} (${code})`);
  for (const [name, docs] of Object.entries(backup)) console.log(`  ${name}: ${docs.length}`);

  if (!confirm) {
    console.log("\nDry run — nothing was deleted. Add --confirm to back up and delete.");
    return;
  }

  mkdirSync("backups", { recursive: true });
  const file = `backups/${code}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, mongoose.mongo.BSON.EJSON.stringify(backup, undefined, 2, { relaxed: false }));
  console.log(`\nBackup saved to ${file}`);

  for (const name of TENANT_COLLECTIONS) await db.collection(name).deleteMany(filter);
  await db.collection("universities").deleteOne({ _id: university._id });
  console.log(`Deleted ${university.name} with its logins and data.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
