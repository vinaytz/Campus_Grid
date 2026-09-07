/**
 * Semester calendar arithmetic.
 *
 * Everything here works on ISO "yyyy-mm-dd" strings and treats them as plain
 * civil dates. That is deliberate: `new Date("2025-08-11")` parses as UTC
 * midnight, so a server in IST or PST would silently shift a date by a day.
 * Parsing the parts by hand and building dates with Date.UTC keeps a date the
 * same date no matter where the process runs.
 */

import type { ICalendarException } from "@/models/Semester";
import type { TeachingDay } from "./types";

const MS_PER_DAY = 86_400_000;

/** "2025-08-11" → UTC epoch ms. Throws on anything that isn't a civil date. */
export function toEpoch(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) throw new Error(`Not a yyyy-mm-dd date: "${iso}"`);
  const [, y, mo, d] = m;
  const epoch = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  const back = fromEpoch(epoch);
  // Rejects 2025-02-30 and friends, which Date.UTC would happily roll over.
  if (back !== iso.trim()) throw new Error(`Not a real calendar date: "${iso}"`);
  return epoch;
}

export function fromEpoch(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export function weekdayOf(iso: string): number {
  return new Date(toEpoch(iso)).getUTCDay();
}

export function addDays(iso: string, n: number): string {
  return fromEpoch(toEpoch(iso) + n * MS_PER_DAY);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toEpoch(b) - toEpoch(a)) / MS_PER_DAY);
}

/** Every ISO date covered by an exception, honouring an optional endDate range. */
function expandException(ex: ICalendarException): string[] {
  const start = ex.date;
  const end = ex.endDate && ex.endDate.trim() ? ex.endDate : ex.date;
  const span = daysBetween(start, end);
  if (span < 0) return [start];
  const out: string[] = [];
  for (let i = 0; i <= span; i++) out.push(addDays(start, i));
  return out;
}

export interface SemesterSpec {
  startDate: string;
  endDate: string;
  teachingWeekdays: number[];
  exceptions: ICalendarException[];
}

/**
 * Resolves a semester into the exact list of days regular classes may occupy.
 *
 * Precedence, highest first:
 *   1. HOLIDAY / EVENT / EXAM  — never a teaching day
 *   2. SPECIAL_WORKING         — always a teaching day, whatever its weekday
 *   3. weekday ∈ teachingWeekdays
 *
 * Blocking wins over SPECIAL_WORKING on the same date: if an admin marks a date
 * both a working Saturday and a holiday, the holiday is the safer reading.
 */
export function buildTeachingDays(spec: SemesterSpec): TeachingDay[] {
  const total = daysBetween(spec.startDate, spec.endDate);
  if (total < 0) {
    throw new Error("Semester end date falls before its start date.");
  }

  const blocked = new Set<string>();
  const special = new Map<string, ICalendarException>();

  for (const ex of spec.exceptions ?? []) {
    const dates = expandException(ex);
    if (ex.kind === "SPECIAL_WORKING") {
      for (const d of dates) special.set(d, ex);
    } else {
      for (const d of dates) blocked.add(d);
    }
  }

  const teaching = new Set(spec.teachingWeekdays ?? []);
  const days: TeachingDay[] = [];

  for (let i = 0; i <= total; i++) {
    const date = addDays(spec.startDate, i);
    if (blocked.has(date)) continue;

    const weekday = weekdayOf(date);
    const bonus = special.get(date);
    if (!teaching.has(weekday) && !bonus) continue;

    const followed = bonus?.followsWeekday;
    days.push({
      date,
      weekday,
      patternWeekday:
        followed !== null && followed !== undefined ? followed : weekday,
      week: 0, // filled below
    });
  }

  // Week index counts ISO-ish weeks from the semester's first teaching day, so
  // "which week of term is this" survives holidays and odd start days.
  if (days.length > 0) {
    const anchor = toEpoch(days[0].date);
    for (const d of days) {
      d.week = Math.floor((toEpoch(d.date) - anchor) / (7 * MS_PER_DAY)) + 1;
    }
  }

  return days;
}

/** Distinct teaching weeks in the calendar — used to size the weekly pattern. */
export function teachingWeekCount(days: TeachingDay[]): number {
  if (days.length === 0) return 0;
  return new Set(days.map((d) => d.week)).size;
}

/** How many times each pattern-weekday recurs, e.g. { 1: 13, 2: 14, … }. */
export function weekdayOccurrences(days: TeachingDay[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const d of days) m.set(d.patternWeekday, (m.get(d.patternWeekday) ?? 0) + 1);
  return m;
}
