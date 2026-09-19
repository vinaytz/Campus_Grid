import type { ZodSchema } from "zod";
import Room from "@/models/Room";
import Faculty from "@/models/Faculty";
import Subject from "@/models/Subject";
import Section from "@/models/Section";
import Assignment from "@/models/Assignment";
import TimeSlot from "@/models/TimeSlot";
import Semester from "@/models/Semester";
import {
  roomSchema, facultySchema, subjectSchema,
  sectionSchema, assignmentSchema, timeSlotSchema, semesterSchema,
} from "./validators";

type ResourceDef = {
  model: any;
  schema: ZodSchema<any>;
  sort: Record<string, 1 | -1>;
  populate?: string[];
  search?: string[];
  /** Collections that must stay empty of dependants before a delete succeeds. */
  guards?: { model: () => any; field: string; label: string }[];
};

/**
 * One registry drives every admin CRUD endpoint and every table screen.
 * Adding a resource here is the only step needed to expose it end-to-end.
 */
export const RESOURCES: Record<string, ResourceDef> = {
  rooms: {
    model: Room,
    schema: roomSchema,
    sort: { block: 1, code: 1 },
    search: ["code", "block"],
    guards: [
      { model: () => Assignment, field: "fixedRoom", label: "assignments" },
      { model: () => Assignment, field: "allowedRooms", label: "assignments" },
    ],
  },
  faculty: {
    model: Faculty,
    schema: facultySchema,
    sort: { name: 1 },
    search: ["name", "facultyId", "department"],
    guards: [{ model: () => Assignment, field: "faculty", label: "assignments" }],
  },
  subjects: {
    model: Subject,
    schema: subjectSchema,
    sort: { code: 1 },
    search: ["code", "name", "department"],
    guards: [{ model: () => Assignment, field: "subject", label: "assignments" }],
  },
  sections: {
    model: Section,
    schema: sectionSchema,
    sort: { number: 1 },
    search: ["number", "program"],
    populate: ["homeRoom"],
    guards: [{ model: () => Assignment, field: "section", label: "assignments" }],
  },
  assignments: {
    model: Assignment,
    schema: assignmentSchema,
    sort: { createdAt: -1 },
    populate: ["section", "subject", "faculty", "fixedRoom", "allowedRooms"],
  },
  slots: {
    model: TimeSlot,
    schema: timeSlotSchema,
    sort: { order: 1 },
  },
  semesters: {
    model: Semester,
    schema: semesterSchema,
    sort: { startDate: -1 },
    search: ["name", "term", "academicYear"],
  },
};

const KIND_LABEL: Record<string, string> = { LECTURE: "Lecture", LAB: "Lab", TUTORIAL: "Tutorial" };

/**
 * A section can have one teaching assignment per subject and type. Returns a
 * plain-English explanation when `body` would repeat one, otherwise null.
 */
export async function assignmentClash(
  universityId: string,
  body: { section: string; subject: string; kind: string },
  excludeId?: string
): Promise<string | null> {
  const existing = await Assignment.findOne({
    universityId, section: body.section, subject: body.subject, kind: body.kind,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  })
    .populate("section", "number").populate("subject", "code").populate("faculty", "name")
    .lean<any>();
  if (!existing) return null;
  const kind = KIND_LABEL[body.kind] ?? body.kind;
  return `Section ${existing.section?.number ?? "?"} already has ${existing.subject?.code ?? "this subject"} (${kind}), ` +
    `taught by ${existing.faculty?.name ?? "another teacher"}. A section can have only one teacher per subject and type — edit that assignment instead.`;
}

export function getResource(name: string) {
  const def = RESOURCES[name];
  if (!def) {
    const err = new Error(`Unknown resource "${name}".`) as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  return def;
}
