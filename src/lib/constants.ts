export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export const ROOM_TYPES = ["CLASSROOM", "LECTURE", "LAB", "SEMINAR", "AUDITORIUM"] as const;
export const SESSION_KINDS = ["LECTURE", "LAB", "TUTORIAL"] as const;
export const SUBJECT_TYPES = ["THEORY", "LAB", "TUTORIAL", "PROJECT"] as const;
export const ROOM_SELECTION_MODES = ["AUTO", "FIXED", "ALLOWED_ROOMS"] as const;

/**
 * Suggested capability tags, offered in the UI as a convenience.
 *
 * This list is *not* authoritative: capabilities are free-form strings matched
 * as a set, so an institution can invent its own tag without touching code. The
 * scheduler never special-cases any value here.
 */
export const ROOM_CAPABILITIES = [
  "PROJECTOR", "BYOD", "COMPUTER", "SMARTBOARD", "WHITEBOARD",
  "AC", "LAB_BENCH", "OSCILLOSCOPE", "ACCESSIBLE",
] as const;

export const CALENDAR_EXCEPTION_KINDS = [
  { value: "HOLIDAY", label: "Holiday", blocks: true },
  { value: "EVENT", label: "University event", blocks: true },
  { value: "EXAM", label: "Exam block", blocks: true },
  { value: "SPECIAL_WORKING", label: "Special working day", blocks: false },
] as const;

/** Session colours keyed by kind — the canvas legend. */
export const KIND_STYLE: Record<string, { chip: string; bar: string }> = {
  LECTURE: { chip: "bg-accent/10 text-ink", bar: "bg-accent" },
  LAB: { chip: "bg-accent/10 text-ink", bar: "bg-accent/70" },
  TUTORIAL: { chip: "bg-accent/10 text-ink", bar: "bg-accent/40" },
};

export const SESSION_COOKIE = "ttms_session";

/** prettyTime that tolerates a missing slot, for optional lookups. */
export function prettyTimeSafe(hhmm?: string) {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

/** "2025-08-11" → "Mon 11 Aug". Parsed as a civil date, never shifted by zone. */
export function prettyDate(iso?: string) {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${DAY_SHORT[d.getUTCDay()].charAt(0)}${DAY_SHORT[d.getUTCDay()].slice(1).toLowerCase()} ${Number(m[3])} ${months[Number(m[2]) - 1]}`;
}
