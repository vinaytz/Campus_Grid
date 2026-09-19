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
  /** Columns the file must have, with the name shown to the admin. */
  required?: Record<string, string>;
  /**
   * Resolves human-readable references (codes, numbers) to ObjectIds. Returns
   * one entry per input row, `null` where the row failed, so row numbers stay
   * aligned with the file.
   */
  resolve?: (
    rows: Record<string, string>[],
    lookups: Lookups
  ) => Promise<{ rows: (Record<string, unknown> | null)[]; issues: ImportIssue[] }>;
  duplicateMessage?: (firstRow: number) => string;
  describe: (row: any, lookups: Lookups) => Record<string, string>;
}

const SESSION_KINDS: Record<string, "LECTURE" | "LAB" | "TUTORIAL"> = {
  lecture: "LECTURE", lec: "LECTURE", l: "LECTURE", theory: "LECTURE", th: "LECTURE", class: "LECTURE",
  lab: "LAB", labs: "LAB", laboratory: "LAB", practical: "LAB", p: "LAB", pr: "LAB",
  tutorial: "TUTORIAL", tut: "TUTORIAL", t: "TUTORIAL",
};

const ROOM_TYPES: Record<string, string> = {
  classroom: "CLASSROOM", class: "CLASSROOM", lecture: "LECTURE", lecturehall: "LECTURE",
  lab: "LAB", laboratory: "LAB", seminar: "SEMINAR", seminarhall: "SEMINAR",
  auditorium: "AUDITORIUM",
};

const squash = (v: string) => v.trim().toLowerCase().replace(/[\s_\-.]+/g, "");

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
      department: ["dept", "school"],
      designation: ["title", "role"],
      maxHoursPerWeek: ["weeklycap", "maxweek"],
      maxHoursPerDay: ["dailycap", "maxday"],
      active: ["enabled"],
    },
    template: ["facultyId", "name", "department", "designation", "maxHoursPerDay", "maxHoursPerWeek", "active"],
    sample: [["23314", "Praveen Malik", "Electronics", "Assistant Professor", 5, 18, "yes"]],
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
      active: ["enabled"],
    },
    template: ["code", "name", "department", "type", "defaultDuration", "active"],
    sample: [
      ["ECE281", "Introduction to IoT", "Electronics", "THEORY", 1, "yes"],
      ["ECE282", "IoT Laboratory", "Electronics", "LAB", 3, "yes"],
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
      section: ["sectionnumber", "sectionno", "sectioncode"],
      subject: ["subjectcode", "coursecode", "subjectid"],
      faculty: [
        "facultyid", "facultyuid", "facultycode", "uid", "staffid", "employeeid", "empid",
        "teacherid", "teacheruid",
      ],
      kind: ["sessionkind", "type", "sessiontype", "classtype"],
      duration: [
        "periods", "hours", "hrs", "sessionduration", "noofhrs", "noofhours",
        "noofhrs/duration", "length",
      ],
      requiredSessions: [
        "sessions", "totalsessions", "semestersessions", "requiredsession", "noofsessions",
        "sessionspersemester", "totalclasses", "classes", "noofclasses",
      ],
      targetWeeklyFrequency: ["perweek", "weekly", "sessionsperweek"],
      roomSelection: ["roommode", "roomselectionmode"],
      fixedRoom: ["room", "pinnedroom"],
      allowedRooms: ["rooms", "roomlist", "permittedrooms"],
      requiredRoomType: ["roomtype"],
      active: ["enabled"],
    },
    template: [
      "section", "subject", "faculty", "kind", "duration", "requiredSessions",
      "targetWeeklyFrequency", "roomSelection", "fixedRoom", "allowedRooms",
      "requiredRoomType", "active",
    ],
    sample: [
      ["2403", "ECE281", "23314", "LECTURE", 1, 40, 3, "AUTO", "", "", "", "yes"],
      ["2403", "ECE282", "23314", "LAB", 3, 13, 1, "ALLOWED_ROOMS", "", "B-301;B-302", "LAB", "yes"],
    ],
    keyOf: (r) => ({ section: r.section, subject: r.subject, kind: r.kind }),
    required: {
      section: "Section", subject: "Subject code", faculty: "Faculty ID", requiredSessions: "Required sessions",
    },
    duplicateMessage: (first) =>
      `Same section, subject and type as row ${first}. A section can have only one teacher per subject and type.`,

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

      const out: (Record<string, unknown> | null)[] = [];
      const missing = (value: string | undefined, empty: string, notFound: string) =>
        value ? notFound : empty;
      rows.forEach((row, i) => {
        const n = i + 1;
        const issuesBefore = issues.length;
        const section = sectionByNumber.get((row.section ?? "").toLowerCase());
        const subject = subjectByCode.get((row.subject ?? "").toLowerCase());
        const faculty = facultyByUid.get((row.faculty ?? "").toLowerCase());

        if (!section) issues.push({ row: n, field: "section", message: missing(row.section,
          "Section is empty.", `No section "${row.section}" exists. Add it on the Sections page first.`) });
        if (!subject) issues.push({ row: n, field: "subject", message: missing(row.subject,
          "Subject code is empty.", `No subject with code "${row.subject}" exists. Add it on the Subjects page first.`) });
        if (!faculty) issues.push({ row: n, field: "faculty", message: missing(row.faculty,
          "Faculty ID is empty.", `No faculty member with ID "${row.faculty}" exists. Add them on the Faculty page first.`) });

        const kindText = (row.kind ?? "").trim();
        const kind = kindText
          ? SESSION_KINDS[squash(kindText)]
          : subject?.type === "LAB" ? "LAB" : subject?.type === "TUTORIAL" ? "TUTORIAL" : "LECTURE";
        if (!kind) {
          issues.push({ row: n, field: "kind", message: `Type "${kindText}" isn't recognised. Use Lecture, Lab or Tutorial.` });
        }

        const roomTypeText = (row.requiredRoomType ?? "").trim();
        const requiredRoomType = roomTypeText ? ROOM_TYPES[squash(roomTypeText)] : undefined;
        if (roomTypeText && !requiredRoomType) {
          issues.push({ row: n, field: "requiredRoomType", message: `Room type "${roomTypeText}" isn't recognised. Use Classroom, Lecture, Lab, Seminar or Auditorium.` });
        }

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

        if (issues.length > issuesBefore || !section || !subject || !faculty) {
          out.push(null);
          return;
        }

        // Infer the room mode from what the admin filled in, so the column is
        // optional in the sheet.
        const mode = row.roomSelection?.toUpperCase().replace(/[\s-]+/g, "_")
          || (fixedRoom ? "FIXED" : allowedRooms.length ? "ALLOWED_ROOMS" : "AUTO");

        out.push({
          section: String(section._id),
          subject: String(subject._id),
          faculty: String(faculty._id),
          kind,
          duration: row.duration || subject.defaultDuration || 1,
          requiredSessions: row.requiredSessions,
          targetWeeklyFrequency: row.targetWeeklyFrequency || null,
          roomSelection: mode,
          fixedRoom,
          allowedRooms,
          requiredRoomType,
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
      };
    },
  },
};

/** Zod's type errors are written for developers; say it the way an admin would. */
function plainMessage(message: string) {
  if (/expected number|received nan/i.test(message)) return "Must be a number.";
  if (/invalid enum value/i.test(message)) return "Not a recognised value.";
  if (/^required$/i.test(message)) return "This value is required.";
  return message;
}

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

  const missingColumns = Object.entries(spec.required ?? {})
    .filter(([key]) => !(key in parsed.rows[0]))
    .map(([, label]) => label);
  if (missingColumns.length) {
    return {
      resource, headers: parsed.headers, unknownHeaders: parsed.unknown,
      rows: [], display: [], created: 0, updated: 0, ok: false,
      issues: [{
        row: 0,
        message: `Missing column${missingColumns.length === 1 ? "" : "s"}: ${missingColumns.join(", ")}. Download the template to see the expected headers.`,
      }],
    };
  }

  const lookups: Lookups = {
    rooms: await Room.find(universityId ? { universityId } : {}).select("code block").lean(),
    faculty: await Faculty.find(universityId ? { universityId } : {}).select("facultyId name").lean(),
    subjects: await Subject.find(universityId ? { universityId } : {}).select("code type defaultDuration").lean(),
    sections: await Section.find(universityId ? { universityId } : {}).select("number").lean(),
  };

  // Resolve human-readable references first, where the resource needs it.
  let candidates: (Record<string, unknown> | null)[] = parsed.rows;
  if (spec.resolve) {
    const resolved = await spec.resolve(parsed.rows, lookups);
    candidates = resolved.rows;
    issues.push(...resolved.issues);
  }

  // Schema validation, row by row. Index i always matches the file's row i + 1.
  const valid: Record<string, unknown>[] = [];
  const display: Record<string, string>[] = [];
  const firstRowByKey = new Map<string, number>();

  for (let i = 0; i < candidates.length; i++) {
    const raw = candidates[i];
    if (!raw) continue;

    const result = spec.schema.safeParse(raw);
    if (!result.success) {
      for (const e of result.error.errors) {
        issues.push({ row: i + 1, field: e.path.join("."), message: plainMessage(e.message) });
      }
      continue;
    }

    // Duplicate natural keys inside the same file would silently overwrite each
    // other on commit, so they are rejected up front.
    const key = JSON.stringify(spec.keyOf(result.data));
    const first = firstRowByKey.get(key);
    if (first !== undefined) {
      issues.push({
        row: i + 1,
        message: spec.duplicateMessage?.(first) ?? `Repeats row ${first}. Each record can appear only once in a file.`,
      });
      continue;
    }
    firstRowByKey.set(key, i + 1);

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
