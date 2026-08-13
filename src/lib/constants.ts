export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export const ROOM_TYPES = ["LECTURE", "LAB", "SEMINAR", "AUDITORIUM"] as const;
export const SESSION_KINDS = ["LECTURE", "LAB", "TUTORIAL"] as const;

/** Session colours keyed by kind — the canvas legend. */
export const KIND_STYLE: Record<string, { chip: string; bar: string }> = {
  LECTURE: { chip: "bg-lapis-soft text-lapis", bar: "bg-lapis" },
  LAB: { chip: "bg-moss-soft text-moss", bar: "bg-moss" },
  TUTORIAL: { chip: "bg-ochre-soft text-ochre", bar: "bg-ochre" },
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
