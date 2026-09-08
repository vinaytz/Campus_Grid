/**
 * Independent verification of a finished, dated timetable.
 *
 * This module is the gate on publishing, and it is written to disagree with the
 * scheduler when the scheduler is wrong. Two deliberate choices make that
 * possible:
 *
 *   1. It reads only the persisted sessions. It never sees the solver's
 *      occupancy ledger, its candidate lists, or its stats.
 *   2. It uses a different algorithm — bucketing every (date, period) a session
 *      touches and looking for duplicate claims — rather than replaying the
 *      solver's incremental accounting. A bug in the ledger cannot hide here,
 *      because the ledger is not consulted.
 *
 * Room *compatibility* is shared with the solver on purpose (see rooms.ts): one
 * definition that both sides agree on beats two that can drift apart.
 */

import type {
  AssignmentRef, AuditReport, DatedSession, FacultyRef, RoomRef, SectionRef,
  SchedulingRules, SlotRef, TeachingDay, Violation,
} from "./types";
import { roomSatisfies } from "./rooms";
import { spanOf, spanIsContiguous, slotsInWindow } from "./time";

export interface AuditInput {
  sessions: DatedSession[];
  assignments: AssignmentRef[];
  teachingDays: TeachingDay[];
  slots: SlotRef[];
  rooms: RoomRef[];
  sections: SectionRef[];
  faculty: FacultyRef[];
  schedulingRules: SchedulingRules;
}

export function auditTimetable(input: AuditInput): AuditReport {
  const { sessions, assignments, teachingDays, slots, rooms, sections, faculty, schedulingRules } = input;

  const hard: Violation[] = [];
  const soft: Violation[] = [];

  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const facultyById = new Map(faculty.map((f) => [f.id, f]));
  const assignmentById = new Map(assignments.map((a) => [a.id, a]));
  const slotByOrder = new Map(slots.map((s) => [s.order, s]));
  const teachingByDate = new Map(teachingDays.map((d) => [d.date, d]));

  const push = (v: Violation) => (v.severity === "HARD" ? hard : soft).push(v);
  const at = (s: DatedSession) => {
    const slot = slotByOrder.get(s.slotOrder);
    return `${s.date} ${slot?.start ?? `period ${s.slotOrder}`}`;
  };
  const who = (s: DatedSession) => {
    const sec = sectionById.get(s.sectionId)?.number ?? "?";
    const a = s.assignmentId ? assignmentById.get(s.assignmentId) : undefined;
    return `${a?.subjectCode ?? "class"} §${sec}`;
  };

  /* ── 1. Clashes: bucket every (owner, date, period) a session occupies ──── */

  type Claim = { session: DatedSession; label: string };
  const claims = {
    faculty: new Map<string, Claim[]>(),
    section: new Map<string, Claim[]>(),
    room: new Map<string, Claim[]>(),
  };

  for (const s of sessions) {
    for (const o of spanOf(s.slotOrder, s.duration)) {
      const cell = `${s.date}:${o}`;
      const add = (m: Map<string, Claim[]>, id: string) => {
        const k = `${id}|${cell}`;
        const list = m.get(k) ?? [];
        list.push({ session: s, label: who(s) });
        m.set(k, list);
      };
      add(claims.faculty, s.facultyId);
      add(claims.section, s.sectionId);
      add(claims.room, s.roomId);
    }
  }

  const clashRule = {
    faculty: { rule: "FACULTY_CLASH", noun: (id: string) => facultyById.get(id)?.name ?? "A faculty member" },
    section: { rule: "SECTION_CLASH", noun: (id: string) => `Section ${sectionById.get(id)?.number ?? id}` },
    room: { rule: "ROOM_CLASH", noun: (id: string) => {
      const r = roomById.get(id);
      return r ? `Room ${r.block}-${r.code}` : "A room";
    } },
  } as const;

  for (const kind of ["faculty", "section", "room"] as const) {
    const seen = new Set<string>();
    for (const [k, list] of claims[kind]) {
      if (list.length < 2) continue;
      const [id] = k.split("|");
      const first = list[0].session;
      // One message per owner per date, not one per overlapping period.
      const dedupe = `${kind}:${id}:${first.date}:${list.map((c) => c.label).sort().join(",")}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      push({
        rule: clashRule[kind].rule,
        severity: "HARD",
        message: `${clashRule[kind].noun(id)} is double-booked at ${at(first)}: ${[...new Set(list.map((c) => c.label))].join(" and ")}.`,
        date: first.date,
        slotOrder: first.slotOrder,
        refs: [...new Set(list.map((c) => c.label))],
      });
    }
  }

  /* ── 2. Per-session structural checks ──────────────────────────────────── */

  const perDayAssignment = new Map<string, DatedSession[]>();

  for (const s of sessions) {
    const section = sectionById.get(s.sectionId);
    const room = roomById.get(s.roomId);
    const a = s.assignmentId ? assignmentById.get(s.assignmentId) : undefined;

    if (!section) {
      push({ rule: "UNKNOWN_SECTION", severity: "HARD", message: `A session on ${s.date} references a section that no longer exists.`, date: s.date });
      continue;
    }
    if (!room) {
      push({ rule: "UNKNOWN_ROOM", severity: "HARD", message: `${who(s)} on ${s.date} references a room that no longer exists.`, date: s.date });
      continue;
    }

    // Capacity — checked directly, not inherited from the solver's decision.
    if (room.capacity < section.strength) {
      push({
        rule: "CAPACITY",
        severity: "HARD",
        message: `${who(s)} at ${at(s)} is in ${room.block}-${room.code}, which seats ${room.capacity} but the section has ${section.strength} students.`,
        date: s.date, slotOrder: s.slotOrder,
      });
    }

    // Room type / capabilities / permitted set — only meaningful for a REGULAR
    // session tied to an assignment that carries the requirement.
    if (a) {
      const verdict = roomSatisfies(room, a, s.kind, section.strength);
      if (!verdict.ok) {
        push({
          rule: a.roomSelection === "AUTO" ? "ROOM_COMPATIBILITY" : "ROOM_RESTRICTION",
          severity: "HARD",
          message: `${who(s)} at ${at(s)} is in ${room.block}-${room.code}: ${verdict.reason}`,
          date: s.date, slotOrder: s.slotOrder,
        });
      }
    }

    // Duration / contiguity.
    const contiguity = spanIsContiguous(slots, s.slotOrder, s.duration, schedulingRules.allowSessionsAcrossBreak);
    if (!contiguity.ok) {
      push({
        rule: "CONTIGUITY",
        severity: "HARD",
        message: `${who(s)} at ${at(s)} spans ${s.duration} periods: ${contiguity.reason}`,
        date: s.date, slotOrder: s.slotOrder,
      });
    }

    // Calendar — a regular class may only sit on a confirmed teaching day.
    // Extra classes are explicit admin exceptions, so they are allowed off-calendar.
    if (s.type === "REGULAR" && !teachingByDate.has(s.date)) {
      push({
        rule: "CALENDAR",
        severity: "HARD",
        message: `${who(s)} is scheduled on ${s.date}, which is not a teaching day on this semester's calendar.`,
        date: s.date, slotOrder: s.slotOrder,
      });
    }

    // Faculty availability, expressed against the weekday the date runs as.
    const fac = facultyById.get(s.facultyId);
    const patternWeekday = teachingByDate.get(s.date)?.patternWeekday ?? s.day;
    if (fac?.unavailability?.length) {
      const blocked = new Set(fac.unavailability.map((u) => `${u.day}:${u.slotOrder}`));
      const hit = spanOf(s.slotOrder, s.duration).some((o) => blocked.has(`${patternWeekday}:${o}`));
      if (hit) {
        push({
          rule: "AVAILABILITY",
          severity: "HARD",
          message: `${fac.name} is marked unavailable at ${at(s)} but is scheduled for ${who(s)}.`,
          date: s.date, slotOrder: s.slotOrder,
        });
      }
    }

    if (s.type === "REGULAR" && s.assignmentId) {
      const k = `${s.assignmentId}:${s.date}`;
      const list = perDayAssignment.get(k) ?? [];
      list.push(s);
      perDayAssignment.set(k, list);
    }
  }

  /* ── 3. Same assignment more than once a day ───────────────────────────── */

  for (const [k, list] of perDayAssignment) {
    if (list.length <= schedulingRules.maxSessionsPerAssignmentPerDay) continue;
    const [, date] = k.split(":");
    push({
      rule: "ASSIGNMENT_PER_DAY",
      severity: "HARD",
      message: `${who(list[0])} occurs ${list.length} times on ${date}; the limit is ${schedulingRules.maxSessionsPerAssignmentPerDay} per day.`,
      date,
    });
  }

  /* ── 4. Exact session counts ───────────────────────────────────────────── */

  const counted = new Map<string, number>();
  for (const s of sessions) {
    if (s.type !== "REGULAR" || !s.assignmentId) continue;
    counted.set(s.assignmentId, (counted.get(s.assignmentId) ?? 0) + 1);
  }

  const countMismatches: AuditReport["countMismatches"] = [];
  for (const a of assignments) {
    const scheduled = counted.get(a.id) ?? 0;
    if (scheduled !== a.requiredSessions) {
      countMismatches.push({
        assignment: `${a.subjectCode} · §${a.sectionNumber}`,
        required: a.requiredSessions,
        scheduled,
      });
    }
  }

  // Sessions pointing at an assignment that no longer exists.
  for (const id of counted.keys()) {
    if (!assignmentById.has(id)) {
      push({
        rule: "ORPHAN_SESSION",
        severity: "HARD",
        message: "The timetable contains sessions for an assignment that has been deleted. Regenerate to clear them.",
      });
      break;
    }
  }

  /* ── 5. Soft observations — reported, never blocking ───────────────────── */

  const classOrders = slots.filter((s) => s.kind === "CLASS").map((s) => s.order);
  const afternoon = slotsInWindow(slots, schedulingRules.afternoonWindowStart, schedulingRules.afternoonWindowEnd);

  // Section day load, for the balance and afternoon-break observations.
  const secDayPeriods = new Map<string, Set<number>>();
  for (const s of sessions) {
    const k = `${s.sectionId}|${s.date}`;
    const set = secDayPeriods.get(k) ?? new Set<number>();
    for (const o of spanOf(s.slotOrder, s.duration)) set.add(o);
    secDayPeriods.set(k, set);
  }

  for (const [k, set] of secDayPeriods) {
    const [sectionId, date] = k.split("|");
    const number = sectionById.get(sectionId)?.number ?? sectionId;

    if (set.size > schedulingRules.maxHoursPerDayPerSection) {
      push({
        rule: "SECTION_DAY_LOAD",
        severity: "HARD",
        message: `Section ${number} has ${set.size} periods on ${date}; the cap is ${schedulingRules.maxHoursPerDayPerSection}.`,
        date,
      });
    }

    if (schedulingRules.preferAfternoonBreak && afternoon.length > 0) {
      const freeInWindow = afternoon.filter((o) => !set.has(o)).length;
      if (freeInWindow === 0) {
        push({
          rule: "NO_AFTERNOON_BREAK",
          severity: "SOFT",
          message: `Section ${number} has no free period between ${schedulingRules.afternoonWindowStart} and ${schedulingRules.afternoonWindowEnd} on ${date}.`,
          date,
        });
      }
    }

    // Long unbroken runs for a section.
    const flags = classOrders.map((o) => set.has(o));
    let run = 0, longest = 0;
    for (const f of flags) { run = f ? run + 1 : 0; longest = Math.max(longest, run); }
    if (longest >= 5) {
      push({
        rule: "CONSECUTIVE_LOAD",
        severity: "SOFT",
        message: `Section ${number} sits ${longest} periods back to back on ${date}.`,
        date,
      });
    }
  }

  const publishable = hard.length === 0 && countMismatches.length === 0;

  return { hardViolations: hard, softViolations: soft, countMismatches, publishable };
}
