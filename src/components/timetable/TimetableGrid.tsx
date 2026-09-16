"use client";
import { cn, prettyTime } from "@/lib/utils";
import { DAY_NAMES, DAY_SHORT, prettyDate } from "@/lib/constants";

export type GridSlot = { order: number; label: string; start: string; end: string; kind: "CLASS" | "BREAK" };
export type GridEntry = {
  _id?: string;
  day: number; slotOrder: number; duration: number; kind: string;
  /** Set for a real dated class; places it in the matching dated column. */
  date?: string;
  type?: "REGULAR" | "EXTRA";
  section?: { _id: string; number: string };
  subject?: { _id: string; code: string; name: string };
  faculty?: { _id: string; name: string; facultyId: string };
  room?: { _id: string; code: string; block: string };
};

/** A dated column. `note` marks a day with no classes (holiday, exam, outside term). */
export type GridDay = { date: string; weekday: number; teaching: boolean; note?: string };

const BAR: Record<string, string> = {
  LECTURE: "bg-accent", LAB: "bg-accent/70", TUTORIAL: "bg-accent/40",
};

/**
 * Read-only week sheet used on the public board. Pass `days` (weekday numbers)
 * for the typical week, or `datedDays` for one real week of the semester.
 */
export function TimetableGrid({
  slots, entries, days = [], datedDays, showRoom = true, showFaculty = true,
}: {
  slots: GridSlot[]; entries: GridEntry[]; days?: number[]; datedDays?: GridDay[];
  showRoom?: boolean; showFaculty?: boolean;
}) {
  const columns = datedDays
    ? datedDays.map((d) => ({ key: d.date, weekday: d.weekday, date: d.date, note: d.teaching ? undefined : d.note }))
    : days.map((d) => ({ key: String(d), weekday: d, date: undefined, note: undefined }));
  const ordered = [...slots].sort((a, b) => a.order - b.order);
  const map = new Map<string, GridEntry>();
  const covered = new Set<string>();
  for (const e of entries) {
    const col = datedDays ? e.date : String(e.day);
    map.set(`${col}:${e.slotOrder}`, e);
    for (let i = 1; i < e.duration; i++) covered.add(`${col}:${e.slotOrder + i}`);
  }

  return (
    <div className="thin-scroll overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[48rem] border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 w-[86px] border-b border-r border-rule bg-ground/90 px-3 py-3 text-left">
              <span className="eyebrow">Time</span>
            </th>
            {columns.map((c) => (
              <th key={c.key} className="border-b border-r border-rule bg-ground/70 px-3 py-3 text-left last:border-r-0">
                <span className="text-[0.86rem] font-semibold tracking-[-0.01em]">
                  <span className="hidden sm:inline">{DAY_NAMES[c.weekday]}</span>
                  <span className="sm:hidden">{DAY_SHORT[c.weekday]}</span>
                </span>
                {c.date && (
                  <span className="block font-mono text-[0.65rem] font-normal text-muted tnum">
                    {prettyDate(c.date).split(" ").slice(1).join(" ")}
                  </span>
                )}
                {c.note && (
                  <span className="mt-0.5 block truncate text-[0.65rem] font-medium text-ochre">{c.note}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="sheet-grid">
          {ordered.map((slot) => (
            <tr key={slot.order}>
              <th scope="row" className="sticky left-0 z-10 border-b border-r border-line bg-surface px-3 py-2 text-left align-top">
                <span className="block font-mono text-[0.68rem] font-medium leading-tight tnum">
                  {prettyTime(slot.start)}
                </span>
                <span className="block font-mono text-[0.62rem] leading-tight text-muted tnum">
                  {prettyTime(slot.end)}
                </span>
              </th>

              {slot.kind === "BREAK" ? (
                <td colSpan={columns.length} className="border-b border-rule bg-ground/70 px-3 py-2 text-center">
                  <span className="label text-muted/80">{slot.label}</span>
                </td>
              ) : (
                columns.map((c) => {
                  const key = `${c.key}:${slot.order}`;
                  if (covered.has(key)) return null;
                  const entry = map.get(key);

                  if (!entry) {
                    return (
                      <td key={key} className={cn(
                        "h-16 border-b border-r border-line/70 last:border-r-0",
                        c.note ? "bg-ground/80" : "bg-surface/95"
                      )} />
                    );
                  }

                  return (
                    <td key={key} rowSpan={entry.duration}
                      className="border-b border-r border-rule/70 p-[3px] align-top last:border-r-0">
                      <div className="group relative flex h-full min-h-[4.25rem] flex-col overflow-hidden rounded-md border border-line/60 bg-surface px-2.5 py-2 transition-colors hover:border-accent/40">
                        <span className={cn("absolute inset-y-0 left-0 w-1", BAR[entry.kind] ?? BAR.LECTURE)} />
                        <span className="font-mono text-[0.7rem] font-semibold leading-tight tracking-[-0.01em]">
                          {entry.subject?.code}
                          {entry.type === "EXTRA" && (
                            <span className="ml-1.5 font-sans text-[0.6rem] font-medium uppercase tracking-wide text-ochre">Extra</span>
                          )}
                        </span>
                        <span className="truncate text-[0.7rem] leading-tight text-muted">
                          {entry.subject?.name}
                        </span>
                        <span className="mt-auto flex flex-wrap items-center gap-x-1.5 pt-0.5 text-[0.65rem] leading-tight text-muted">
                          {showFaculty && entry.faculty && <span className="truncate">{entry.faculty.name}</span>}
                          {showRoom && entry.room && (
                            <span className="font-mono text-graphite-500">{entry.room.block}-{entry.room.code}</span>
                          )}
                          {entry.section && <span className="font-mono text-graphite-500">§{entry.section.number}</span>}
                        </span>
                      </div>
                    </td>
                  );
                })
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
