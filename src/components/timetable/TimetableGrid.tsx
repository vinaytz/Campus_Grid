"use client";
import { cn, prettyTime } from "@/lib/utils";
import { DAY_NAMES, DAY_SHORT } from "@/lib/constants";

export type GridSlot = { order: number; label: string; start: string; end: string; kind: "CLASS" | "BREAK" };
export type GridEntry = {
  _id?: string;
  day: number; slotOrder: number; duration: number; kind: string;
  section?: { _id: string; number: string };
  subject?: { _id: string; code: string; name: string };
  faculty?: { _id: string; name: string; facultyId: string };
  room?: { _id: string; code: string; block: string };
};

const BAR: Record<string, string> = {
  LECTURE: "bg-lapis", LAB: "bg-moss", TUTORIAL: "bg-ochre",
};

/** Read-only week sheet used on the public board. */
export function TimetableGrid({
  slots, entries, days, showRoom = true, showFaculty = true,
}: {
  slots: GridSlot[]; entries: GridEntry[]; days: number[];
  showRoom?: boolean; showFaculty?: boolean;
}) {
  const ordered = [...slots].sort((a, b) => a.order - b.order);
  const map = new Map<string, GridEntry>();
  const covered = new Set<string>();
  for (const e of entries) {
    map.set(`${e.day}:${e.slotOrder}`, e);
    for (let i = 1; i < e.duration; i++) covered.add(`${e.day}:${e.slotOrder + i}`);
  }

  return (
    <div className="thin-scroll overflow-x-auto rounded-md border border-rule bg-sheet shadow-sheet">
      <table className="w-full min-w-[48rem] border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 w-[74px] border-b border-r border-rule bg-sheet px-2 py-2 text-left">
              <span className="label">Period</span>
            </th>
            {days.map((d) => (
              <th key={d} className="border-b border-r border-rule bg-sheet px-2 py-2 text-left last:border-r-0">
                <span className="text-[0.8125rem] font-semibold tracking-[-0.01em]">
                  <span className="hidden sm:inline">{DAY_NAMES[d]}</span>
                  <span className="sm:hidden">{DAY_SHORT[d]}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="sheet-grid">
          {ordered.map((slot) => (
            <tr key={slot.order}>
              <th scope="row" className="sticky left-0 z-10 border-b border-r border-rule bg-sheet px-2 py-1.5 text-left align-top">
                <span className="block font-mono text-[0.68rem] font-medium leading-tight tnum">
                  {prettyTime(slot.start)}
                </span>
                <span className="block font-mono text-[0.62rem] leading-tight text-muted tnum">
                  {prettyTime(slot.end)}
                </span>
              </th>

              {slot.kind === "BREAK" ? (
                <td colSpan={days.length} className="border-b border-rule bg-ground/70 px-3 py-2 text-center">
                  <span className="label text-muted/80">{slot.label}</span>
                </td>
              ) : (
                days.map((day) => {
                  const key = `${day}:${slot.order}`;
                  if (covered.has(key)) return null;
                  const entry = map.get(key);

                  if (!entry) {
                    return <td key={key} className="h-14 border-b border-r border-rule/70 last:border-r-0" />;
                  }

                  return (
                    <td key={key} rowSpan={entry.duration}
                      className="border-b border-r border-rule/70 p-[3px] align-top last:border-r-0">
                      <div className="relative flex h-full min-h-[3.1rem] flex-col overflow-hidden rounded-sm border border-rule-strong/60 bg-sheet py-1 pl-2 pr-1.5">
                        <span className={cn("absolute inset-y-0 left-0 w-[3px]", BAR[entry.kind] ?? BAR.LECTURE)} />
                        <span className="font-mono text-[0.7rem] font-semibold leading-tight tracking-[-0.01em]">
                          {entry.subject?.code}
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
