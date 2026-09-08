/**
 * Bulk import: parse → schema validate → domain validate → preview → commit.
 *
 * Nothing is written during preview, and a commit is all-or-nothing: rows are
 * validated as a batch and inserted in one call, so a bad row 40 never leaves
 * rows 1–39 half-imported.
 */

import Room from "@/models/Room";
import Faculty from "@/models/Faculty";
import Subject from "@/models/Subject";
import Section from "@/models/Section";
import Assignment from "@/models/Assignment";
import {
  roomSchema, facultySchema, subjectSchema, sectionSchema, assignmentSchema,
} from "./validators";
import { parseRows, toCsv } from "./csv";
import type { ZodSchema } from "zod";

export type ImportResource = "rooms" | "faculty" | "subjects" | "sections" | "assignments";

export interface ImportIssue {
  row: number;          // 1-based, matching the spreadsheet body
  field?: string;
  message: string;
}

export interface ImportPreview {
  resource: ImportResource;
  headers: string[];
  unknownHeaders: string[];
  /** Rows that passed both schema and domain validation, ready to commit. */
  rows: Record<string, unknown>[];
  /** What each valid row will look like to a human, for the preview table. */
  display: Record<string, string>[];
  issues: ImportIssue[];
  created: number;
  updated: number;
  ok: boolean;
}

interface Spec {
  model: any;
  schema: ZodSchema<any>;
  aliases: Record<string, string[]>;
  template: string[];
  sample: (string | number)[][];
  /** Natural key used to tell an update from an insert. */
  keyOf: (row: any) => Record<string, unknown>;
  /** Resolves human-readable references (codes, numbers) to ObjectIds. */
  resolve?: (
    rows: Record<string, string>[],
    lookups: Lookups
  ) => Promise<{ rows: Record<string, unknown>[]; issues: ImportIssue[] }>;
  describe: (row: any, lookups: Lookups) => Record<string, string>;
}

interface Lookups {
  rooms: any[];
  faculty: any[];
  subjects: any[];
  sections: any[];
}

export const SPECS: Record<ImportResource, Spec> = {
  rooms: {
    model: Room,
    schema: roomSchema,
    aliases: {
      code: ["room", "roomnumber", "room no", "number"],
      block: ["building", "wing"],
      capacity: ["seats", "size", "strength"],
      type: ["roomtype", "kind"],
      capabilities: ["tags", "features", "facilities"],
      active: ["bookable", "enabled"],
    },
    template: ["block", "code", "capacity", "type", "capabilities", "active"],
    sample: [
      ["A", "101", 70, "CLASSROOM", "PROJECTOR", "yes"],
      ["B", "301", 65, "LAB", "COMPUTER;PROJECTOR;BYOD", "yes"],
    ],
    keyOf: (r) => ({ block: r.block, code: r.code }),
    describe: (r) => ({
      Room: `${r.block}-${r.code}`,
      Capacity: String(r.capacity),
      Type: r.type,
      Capabilities: (r.capabilities ?? []).join(", ") || "—",
    }),
  },

  faculty: {
    model: Faculty,
    schema: facultySchema,
    aliases: {
      facultyId: ["uid", "id", "employeeid", "staffid", "code"],
      name: ["fullname", "facultyname"],
      email: ["mail", "emailaddress"],
      department: ["dept", "school"],
      designation: ["title", "role"],
      maxHoursPerWeek: ["weeklycap", "maxweek"],
      maxHoursPerDay: ["dailycap", "maxday"],
      active: ["enabled"],
    },
    template: ["facultyId", "name", "email", "department", "designation", "maxHoursPerDay", "maxHoursPerWeek", "active"],
    sample: [["23314", "Praveen Malik", "praveen@school.edu", "Electronics", "Assistant Professor", 5, 18, "yes"]],
    keyOf: (r) => ({ facultyId: r.facultyId }),
    describe: (r) => ({
      ID: r.facultyId, Name: r.name, Department: r.department || "—",
      "Daily cap": String(r.maxHoursPerDay),
    }),
  },

  subjects: {
    model: Subject,
    schema: subjectSchema,
    aliases: {
      code: ["subjectcode", "coursecode"],
      name: ["subjectname", "title", "coursename"],
      department: ["dept", "school"],
      type: ["subjecttype", "category"],
      defaultDuration: ["duration", "periods", "hours"],
      credits: ["credit"],
      active: ["enabled"],
    },
    template: ["code", "name", "department", "type", "defaultDuration", "credits", "active"],
    sample: [
      ["ECE281", "Introduction to IoT", "Electronics", "THEORY", 1, 4, "yes"],
      ["ECE282", "IoT Laboratory", "Electronics", "LAB", 3, 2, "yes"],
    ],
    keyOf: (r) => ({ code: r.code }),
    describe: (r) => ({ Code: r.code, Name: r.name, Type: r.type, Periods: String(r.defaultDuration) }),
  },

  sections: {
    model: Section,
    schema: sectionSchema,
    aliases: {
      number: ["section", "sectionnumber", "sectionno"],
      program: ["course", "branch", "degree", "name"],
      semester: ["sem", "term"],
      strength: ["students", "size", "count"],
      active: ["enabled"],
    },
    template: ["number", "program", "semester", "strength", "active"],
    sample: [["2403", "B.Tech CSE", 4, 58, "yes"]],
    keyOf: (r) => ({ number: r.number }),
    describe: (r) => ({
      Section: r.number, Program: r.program,
      Semester: String(r.semester), Students: String(r.strength),
    }),
  },

  assignments: {
    model: Assignment,
    schema: assignmentSchema,
    aliases: {
      section: ["sectionnumber", "sectionno"],
      subject: ["subjectcode", "coursecode"],
      faculty: ["facultyid", "uid", "staffid"],
      kind: ["sessionkind", "type"],
      duration: ["periods", "hours", "sessionduration"],
      requiredSessions: ["sessions", "totalsessions", "semestersessions", "requiredsession"],
      targetWeeklyFrequency: ["perweek", "weekly", "sessionsperweek"],
      roomSelection: ["roommode", "roomselectionmode"],
      fixedRoom: ["room", "pinnedroom"],
      allowedRooms: ["rooms", "roomlist", "permittedrooms"],
      requiredRoomType: ["roomtype"],
      requiredCapabilities: ["capabilities", "roomtags", "features"],
      active: ["enabled"],
    },
    template: [
      "section", "subject", "faculty", "kind", "duration", "requiredSessions",
      "targetWeeklyFrequency", "roomSelection", "fixedRoom", "allowedRooms",
      "requiredRoomType", "requiredCapabilities", "active",
    ],
    sample: [
      ["2403", "ECE281", "23314", "LECTURE", 1, 40, 3, "AUTO", "", "", "", "", "yes"],
      ["2403", "ECE282", "23314", "LAB", 3, 13, 1, "ALLOWED_ROOMS", "", "B-301;B-302", "LAB", "COMPUTER", "yes"],
    ],
    keyOf: (r) => ({ section: r.section, subject: r.subject, kind: r.kind }),

    /**
     * Assignments are the only resource that references others. Admins write
     * codes ("2403", "ECE281", "23314", "B-301"), not ObjectIds, so those are
     * resolved here and an unresolvable reference becomes a row issue.
     */
    async resolve(rows, lookups) {
      const issues: ImportIssue[] = [];
      const sectionByNumber = new Map(lookups.sections.map((s) => [String(s.number).toLowerCase(), s]));
      const subjectByCode = new Map(lookups.subjects.map((s) => [String(s.code).toLowerCase(), s]));
      const facultyByUid = new Map(lookups.faculty.map((f) => [String(f.facultyId).toLowerCase(), f]));
      const roomByName = new Map<string, any>();
      for (const r of lookups.rooms) {
        roomByName.set(`${r.block}-${r.code}`.toLowerCase(), r);
        roomByName.set(String(r.code).toLowerCase(), r);
      }

      const out: Record<string, unknown>[] = [];
      rows.forEach((row, i) => {
        const n = i + 1;
        const section = sectionByNumber.get((row.section ?? "").toLowerCase());
        const subject = subjectByCode.get((row.subject ?? "").toLowerCase());
        const faculty = facultyByUid.get((row.faculty ?? "").toLowerCase());

        if (!section) issues.push({ row: n, field: "section", message: `No section numbered "${row.section}".` });
        if (!subject) issues.push({ row: n, field: "subject", message: `No subject with code "${row.subject}".` });
        if (!faculty) issues.push({ row: n, field: "faculty", message: `No faculty member with ID "${row.faculty}".` });

        let fixedRoom: string | undefined;
        if (row.fixedRoom) {
          const room = roomByName.get(row.fixedRoom.toLowerCase());
          if (!room) issues.push({ row: n, field: "fixedRoom", message: `No room called "${row.fixedRoom}".` });
          else fixedRoom = String(room._id);
        }

        const allowedRooms: string[] = [];
        if (row.allowedRooms) {
          for (const name of row.allowedRooms.split(/[;|]/).map((s) => s.trim()).filter(Boolean)) {
            const room = roomByName.get(name.toLowerCase());
            if (!room) issues.push({ row: n, field: "allowedRooms", message: `No room called "${name}".` });
            else allowedRooms.push(String(room._id));
          }
        }

        if (!section || !subject || !faculty) return;

        // Infer the room mode from what the admin filled in, so the column is
        // optional in the sheet.
        const mode = row.roomSelection?.toUpperCase()
          || (fixedRoom ? "FIXED" : allowedRooms.length ? "ALLOWED_ROOMS" : "AUTO");

        out.push({
          section: String(section._id),
          subject: String(subject._id),
          faculty: String(faculty._id),
          kind: (row.kind || (subject.type === "LAB" ? "LAB" : "LECTURE")).toUpperCase(),
          duration: row.duration || subject.defaultDuration || 1,
          requiredSessions: row.requiredSessions,
          targetWeeklyFrequency: row.targetWeeklyFrequency || null,
          roomSelection: mode,
          fixedRoom,
          allowedRooms,
          requiredRoomType: row.requiredRoomType?.toUpperCase() || undefined,
          requiredCapabilities: row.requiredCapabilities ?? "",
          // Left as written; the schema's boolish reader understands "no", "0",
          // "inactive" and friends, and treats a blank cell as active.
          active: row.active,
        });
      });

      return { rows: out, issues };
    },

    /**
     * Assignments store ids, which mean nothing to a reader, so the preview
     * resolves them back to the codes the admin typed.
     */
    describe: (r, lookups) => {
      const section = lookups.sections.find((s) => String(s._id) === String(r.section));
      const subject = lookups.subjects.find((s) => String(s._id) === String(r.subject));
      const faculty = lookups.faculty.find((f) => String(f._id) === String(r.faculty));
      const roomName = (id: unknown) => {
        const room = lookups.rooms.find((x) => String(x._id) === String(id));
        return room ? `${room.block}-${room.code}` : "?";
      };
      return {
        Section: section?.number ?? "?",
        Subject: subject?.code ?? "?",
        Faculty: faculty?.name ?? "?",
        Kind: r.kind,
        Sessions: `${r.requiredSessions} × ${r.duration}p`,
        Room: r.roomSelection === "FIXED"
          ? roomName(r.fixedRoom)
          : r.roomSelection === "ALLOWED_ROOMS"
          ? `${(r.allowedRooms ?? []).length} allowed`
          : r.requiredRoomType ?? "Auto",
        Needs: (r.requiredCapabilities ?? []).join(", ") || "—",
      };
    },
  },
};

export function templateFor(resource: ImportResource) {
  const spec = SPECS[resource];
  return toCsv(spec.template, spec.sample);
}

/**
 * Validates an uploaded CSV without writing anything.
 *
 * Every row is checked, not just up to the first failure — an admin fixing a
 * spreadsheet wants the whole list of problems in one pass.
 */
export async function previewImport(
  resource: ImportResource,
  text: string,
  universityId?: string
): Promise<ImportPreview> {
  const spec = SPECS[resource];
  const parsed = parseRows(text, spec.aliases);
  const issues: ImportIssue[] = [];

  if (parsed.rows.length === 0) {
    return {
      resource, headers: parsed.headers, unknownHeaders: parsed.unknown,
      rows: [], display: [], created: 0, updated: 0, ok: false,
      issues: [{ row: 0, message: "That file has a header row but no data rows." }],
    };
  }

  const lookups: Lookups = {
    rooms: await Room.find(universityId ? { universityId } : {}).select("code block").lean(),
    faculty: await Faculty.find(universityId ? { universityId } : {}).select("facultyId name").lean(),
    subjects: await Subject.find(universityId ? { universityId } : {}).select("code type defaultDuration").lean(),
    sections: await Section.find(universityId ? { universityId } : {}).select("number").lean(),
  };

  // Resolve human-readable references first, where the resource needs it.
  let candidates: Record<string, unknown>[] = parsed.rows;
  if (spec.resolve) {
    const resolved = await spec.resolve(parsed.rows, lookups);
    candidates = resolved.rows;
    issues.push(...resolved.issues);
  }

  // Schema validation, row by row.
  const valid: Record<string, unknown>[] = [];
  const display: Record<string, string>[] = [];
  const seenKeys = new Set<string>();

  for (let i = 0; i < candidates.length; i++) {
    const raw = candidates[i];

    const result = spec.schema.safeParse(raw);
    if (!result.success) {
      for (const e of result.error.errors) {
        issues.push({ row: i + 1, field: e.path.join("."), message: e.message });
      }
      continue;
    }

    // Duplicate natural keys inside the same file would silently overwrite each
    // other on commit, so they are rejected up front.
    const key = JSON.stringify(spec.keyOf(result.data));
    if (seenKeys.has(key)) {
      issues.push({ row: i + 1, message: "This row duplicates an earlier row in the same file." });
      continue;
    }
    seenKeys.add(key);

    valid.push(result.data);
    // Describe the PARSED row, never the raw text: a capabilities cell is a
    // string until parsing splits it, and numbers are strings until coerced.
    display.push(spec.describe(result.data, lookups));
  }

  // Which of the valid rows already exist?
  let updated = 0;
  if (valid.length) {
    const keys = valid.map((r) => spec.keyOf(r));
    const existing = await spec.model.find({ ...(universityId ? { universityId } : {}), $or: keys }).lean();
    const existingKeys = new Set(existing.map((e: any) => JSON.stringify(spec.keyOf(e))));
    updated = valid.filter((r) => existingKeys.has(JSON.stringify(spec.keyOf(r)))).length;
  }

  return {
    resource,
    headers: parsed.headers,
    unknownHeaders: parsed.unknown,
    rows: valid,
    display,
    issues,
    created: valid.length - updated,
    updated,
    ok: issues.length === 0 && valid.length > 0,
  };
}

/**
 * Writes a previously previewed batch.
 *
 * Refuses partial batches: the rows are re-validated here (the client is never
 * trusted to have kept the preview honest) and a single failure aborts the whole
 * import before anything is written.
 */
export async function commitImport(
  resource: ImportResource,
  rows: Record<string, unknown>[],
  universityId?: string
): Promise<{ created: number; updated: number }> {
  const spec = SPECS[resource];

  const parsed = rows.map((r) => spec.schema.safeParse(r));
  const bad = parsed.findIndex((p) => !p.success);
  if (bad >= 0) {
    const e = parsed[bad] as { success: false; error: any };
    const first = e.error.errors[0];
    const err = new Error(
      `Row ${bad + 1} is not valid: ${first.path.join(".") || "input"} ${first.message}. Nothing was imported.`
    ) as Error & { status?: number };
    err.status = 422;
    throw err;
  }

  const docs = parsed.map((p) => (p as { success: true; data: any }).data);

  const ops = docs.map((d) => ({
    updateOne: {
      filter: { ...(universityId ? { universityId } : {}), ...spec.keyOf(d) },
      update: { $set: { ...d, ...(universityId ? { universityId } : {}) } },
      upsert: true,
    },
  }));

  const res = await spec.model.bulkWrite(ops, { ordered: true });
  return {
    created: res.upsertedCount ?? 0,
    updated: res.modifiedCount ?? 0,
  };
}
