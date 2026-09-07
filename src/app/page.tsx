"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ArrowUpRight, Clock3, MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import { useResource } from "@/hooks/useApi";
import { TimetableGrid, type GridEntry, type GridSlot } from "@/components/timetable/TimetableGrid";
import { Segmented } from "@/components/ui/Field";
import { Swatch } from "@/components/ui/Badge";
import { cn, prettyTime } from "@/lib/utils";
import { DAY_NAMES, DAY_SHORT, prettyDate } from "@/lib/constants";

type View = "section" | "faculty" | "room";
type Mode = "week" | "typical";

type DatedSession = GridEntry & {
  date: string;
  type: "REGULAR" | "EXTRA";
  reason?: string;
};

type Payload = {
  published: boolean;
  settings: { institutionName: string; academicYear: string; term: string; workingDays: number[] } | null;
  slots: GridSlot[];
  directory: {
    sections: { _id: string; number: string; program: string; semester: number }[];
    faculty: { _id: string; name: string; facultyId: string; department: string }[];
    rooms: { _id: string; code: string; block: string; type: string }[];
  };
  entries: GridEntry[];
  sessions: DatedSession[];
  semester: { name: string; startDate: string; endDate: string; teachingWeekdays: number[] } | null;
  meta: { name: string; academicYear: string; term: string } | null;
};

/** Local civil date, so "today" means today where the reader is. */
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shift(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** The Monday of the week containing `iso`. */
function weekStart(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const back = (dt.getUTCDay() + 6) % 7;
  return shift(iso, -back);
}

export default function PublicBoard() {
  const [view, setView] = useState<View>("section");
  const [mode, setMode] = useState<Mode>("week");
  const [id, setId] = useState("");
  const [query, setQuery] = useState("");
  const [anchor, setAnchor] = useState(() => weekStart(todayIso()));

  const from = anchor;
  const to = shift(anchor, 6);

  const { data, loading } = useResource<Payload>(
    `/api/public?view=${view}${id ? `&id=${id}` : ""}&from=${from}&to=${to}`
  );

  const options = useMemo(() => {
    if (!data) return [];
    const d = data.directory;
    const list =
      view === "faculty"
        ? d.faculty.map((f) => ({ id: f._id, primary: f.name, secondary: `${f.facultyId} · ${f.department}` }))
        : view === "room"
        ? d.rooms.map((r) => ({ id: r._id, primary: `${r.block}-${r.code}`, secondary: r.type.toLowerCase() }))
        : d.sections.map((s) => ({ id: s._id, primary: s.number, secondary: `${s.program} · Sem ${s.semester}` }));
    const q = query.trim().toLowerCase();
    return q ? list.filter((o) => `${o.primary} ${o.secondary}`.toLowerCase().includes(q)) : list;
  }, [data, view, query]);

  const selected = options.find((o) => o.id === id) ?? null;
  const days = data?.settings?.workingDays ?? [1, 2, 3, 4, 5];
  const slotBy = new Map((data?.slots ?? []).map((s) => [s.order, s]));

  const today = todayIso();
  const todays = (data?.sessions ?? [])
    .filter((s) => s.date === today)
    .sort((a, b) => a.slotOrder - b.slotOrder);

  /** Dates in the visible week that actually carry classes. */
  const weekDates = useMemo(() => {
    const set = new Set((data?.sessions ?? []).map((s) => s.date));
    return Array.from({ length: 7 }, (_, i) => shift(anchor, i)).filter((d) => set.has(d));
  }, [data?.sessions, anchor]);

  const byCell = useMemo(() => {
    const map = new Map<string, DatedSession>();
    const covered = new Set<string>();
    for (const s of data?.sessions ?? []) {
      map.set(`${s.date}:${s.slotOrder}`, s);
      for (let i = 1; i < s.duration; i++) covered.add(`${s.date}:${s.slotOrder + i}`);
    }
    return { map, covered };
  }, [data?.sessions]);

  const ordered = useMemo(
    () => [...(data?.slots ?? [])].sort((a, b) => a.order - b.order),
    [data?.slots]
  );

  return (
    <div className="min-h-dvh bg-ground">
      <header className="chrome sticky top-0 z-40 text-white">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[0.95rem] tracking-[-0.01em]">Chronos</span>
            <span className="hidden font-mono text-[0.6rem] uppercase tracking-[0.12em] text-white/35 sm:inline">
              {data?.settings?.institutionName ?? ""}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 font-mono text-[0.62rem] uppercase tracking-[0.1em] text-white/45">
              <span className={cn("size-1.5 rounded-full", data?.published ? "bg-moss animate-tick" : "bg-white/25")} />
              {data?.published ? "Live" : "Unpublished"}
            </span>
            <Link href="/login"
              className="inline-flex items-center gap-1 rounded border border-white/12 px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.1em] text-white/65 transition-colors hover:border-white/35 hover:text-white">
              Admin <ArrowUpRight className="size-3" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 border-b border-rule-strong pb-6">
          <p className="label mb-2">
            {data?.semester
              ? `${data.semester.name} · ${prettyDate(data.semester.startDate)} → ${prettyDate(data.semester.endDate)}`
              : data?.meta ? `${data.meta.term} term · ${data.meta.academicYear}` : "Class schedule"}
          </p>
          <h1 className="font-display text-[2.1rem] leading-[1.05] tracking-[-0.028em] sm:text-[2.75rem]">
            {selected ? (
              view === "section" ? <>Section <span className="tnum">{selected.primary}</span></> : selected.primary
            ) : "Find your week"}
          </h1>
          <p className="mt-3 max-w-lg text-[0.875rem] leading-relaxed text-muted">
            {selected
              ? selected.secondary
              : "Look up the published timetable by section, by the faculty member teaching, or by room."}
          </p>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <Segmented<View>
            value={view}
            onChange={(v) => { setView(v); setId(""); setQuery(""); }}
            options={[
              { value: "section", label: "Section" },
              { value: "faculty", label: "Faculty" },
              { value: "room", label: "Room" },
            ]}
          />
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted/70" />
            <input
              value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${view === "faculty" ? "faculty" : `${view}s`}`}
              aria-label={`Search ${view}s`}
              className="h-9 w-full rounded border border-rule-strong/70 bg-sheet pl-8 pr-3 text-sm transition-colors placeholder:text-muted/55 hover:border-graphite-400 focus:border-claret"
            />
          </div>
        </div>

        {options.length > 0 && (
          <div className="thin-scroll mb-8 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {options.slice(0, 48).map((o) => (
              <button
                key={o.id} onClick={() => setId(o.id === id ? "" : o.id)}
                className={cn(
                  "rounded-sm border px-2.5 py-1 text-left transition-all duration-150 ease-physical",
                  o.id === id
                    ? "border-claret bg-claret text-white shadow-hair"
                    : "border-rule-strong/60 bg-sheet text-ink hover:border-graphite-400"
                )}
              >
                <span className="font-mono text-[0.72rem] font-medium">{o.primary}</span>
                <span className={cn("ml-1.5 text-[0.68rem]", o.id === id ? "text-white/65" : "text-muted")}>
                  {o.secondary}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Today — the answer most people came for */}
        <AnimatePresence>
          {id && todays.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.2, 0.9, 0.3, 1] }}
              className="mb-6 rounded-md border border-rule bg-sheet shadow-hair"
            >
              <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
                <span className="label">{DAY_NAMES[new Date().getDay()]} — today</span>
                <span className="font-mono text-[0.68rem] text-muted tnum">{todays.length}</span>
              </div>
              <ul className="divide-y divide-rule/70">
                {todays.map((e, i) => {
                  const slot = slotBy.get(e.slotOrder);
                  return (
                    <li key={e._id ?? i} className="flex items-center gap-3 px-4 py-2.5">
                      <Swatch kind={e.kind} />
                      <span className="w-[4.6rem] shrink-0 font-mono text-[0.72rem] text-muted tnum">
                        {slot ? prettyTime(slot.start) : "—"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.8125rem] font-medium">
                          <span className="font-mono">{e.subject?.code}</span>
                          <span className="ml-2 font-normal text-muted">{e.subject?.name}</span>
                          {e.type === "EXTRA" && (
                            <span className="ml-2 rounded-xs bg-ochre-soft px-1 font-mono text-[0.58rem] uppercase text-ochre">
                              extra
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[0.7rem] text-muted">
                          {e.faculty?.name}{e.reason ? ` · ${e.reason}` : ""}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 font-mono text-[0.72rem] text-muted">
                        <MapPin className="size-3" />
                        {e.room ? `${e.room.block}-${e.room.code}` : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Week / typical-week switch */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: "week", label: "This week" },
              { value: "typical", label: "Typical week" },
            ]}
          />
          <div className="flex items-center gap-3 text-[0.68rem] text-muted">
            <span className="flex items-center gap-1"><Swatch kind="LECTURE" /> Lecture</span>
            <span className="flex items-center gap-1"><Swatch kind="LAB" /> Lab</span>
            <span className="flex items-center gap-1"><Swatch kind="TUTORIAL" /> Tutorial</span>
          </div>
        </div>

        {mode === "week" && (
          <div className="mb-3 flex items-center gap-2">
            <button onClick={() => setAnchor((a) => shift(a, -7))} aria-label="Previous week"
              className="rounded border border-rule-strong/70 bg-sheet p-1.5 transition-colors hover:border-graphite-400">
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="font-mono text-micro text-muted tnum">
              {prettyDate(from)} → {prettyDate(to)}
            </span>
            <button onClick={() => setAnchor((a) => shift(a, 7))} aria-label="Next week"
              className="rounded border border-rule-strong/70 bg-sheet p-1.5 transition-colors hover:border-graphite-400">
              <ChevronRight className="size-3.5" />
            </button>
            {anchor !== weekStart(today) && (
              <button onClick={() => setAnchor(weekStart(today))}
                className="ml-1 text-micro text-muted underline transition-colors hover:text-ink">
                Back to this week
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center rounded-md border border-rule bg-sheet">
            <div className="h-1 w-32 overflow-hidden rounded-full bg-ink/10">
              <div className="sweeping h-full w-full animate-sweep rounded-full" />
            </div>
          </div>
        ) : !data?.published ? (
          <div className="rounded-md border border-dashed border-rule-strong bg-sheet px-6 py-16 text-center">
            <Clock3 className="mx-auto mb-3 size-5 text-muted" />
            <p className="font-display text-base">No timetable published yet</p>
            <p className="mx-auto mt-1 max-w-sm text-[0.8125rem] text-muted">
              This board fills in as soon as an administrator publishes the schedule.
            </p>
          </div>
        ) : mode === "typical" ? (
          <TimetableGrid
            slots={data.slots} entries={data.entries} days={days}
            showFaculty={view !== "faculty"} showRoom={view !== "room"}
          />
        ) : weekDates.length === 0 ? (
          <div className="rounded-md border border-dashed border-rule-strong bg-sheet px-6 py-12 text-center">
            <p className="text-[0.875rem]">No classes this week</p>
            <p className="mt-1 text-[0.8125rem] text-muted">
              A holiday, an exam block, or the term has not started. Use the arrows to look at another week.
            </p>
          </div>
        ) : (
          <div className="thin-scroll overflow-x-auto rounded-md border border-rule bg-sheet shadow-sheet">
            <table className="w-full min-w-[48rem] border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 w-[74px] border-b border-r border-rule bg-sheet px-2 py-2 text-left">
                    <span className="label">Period</span>
                  </th>
                  {weekDates.map((d) => {
                    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
                    return (
                      <th key={d} className={cn(
                        "border-b border-r border-rule px-2 py-2 text-left last:border-r-0",
                        d === today ? "bg-claret-soft/40" : "bg-sheet"
                      )}>
                        <span className="block text-[0.8125rem] font-semibold tracking-[-0.01em]">
                          {DAY_SHORT[wd].charAt(0)}{DAY_SHORT[wd].slice(1).toLowerCase()}
                        </span>
                        <span className="block font-mono text-[0.62rem] text-muted tnum">
                          {prettyDate(d).replace(/^\S+\s/, "")}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="sheet-grid">
                {ordered.map((slot) => (
                  <tr key={slot.order}>
                    <th scope="row" className="sticky left-0 z-10 border-b border-r border-rule bg-sheet px-2 py-1.5 text-left align-top">
                      <span className="block font-mono text-[0.68rem] font-medium leading-tight tnum">{prettyTime(slot.start)}</span>
                      <span className="block font-mono text-[0.62rem] leading-tight text-muted tnum">{prettyTime(slot.end)}</span>
                    </th>
                    {slot.kind === "BREAK" ? (
                      <td colSpan={weekDates.length} className="border-b border-rule bg-ground/70 px-3 py-2 text-center">
                        <span className="label text-muted/80">{slot.label}</span>
                      </td>
                    ) : (
                      weekDates.map((d) => {
                        const key = `${d}:${slot.order}`;
                        if (byCell.covered.has(key)) return null;
                        const e = byCell.map.get(key);
                        if (!e) return <td key={key} className="h-14 border-b border-r border-rule/70 last:border-r-0" />;
                        return (
                          <td key={key} rowSpan={e.duration}
                            className="border-b border-r border-rule/70 p-[3px] align-top last:border-r-0">
                            <div className={cn(
                              "relative flex h-full min-h-[3.1rem] flex-col overflow-hidden rounded-sm border bg-sheet py-1 pl-2 pr-1.5",
                              e.type === "EXTRA" ? "border-dashed border-ochre" : "border-rule-strong/60"
                            )}>
                              <span className={cn("absolute inset-y-0 left-0 w-[3px]",
                                e.kind === "LAB" ? "bg-moss" : e.kind === "TUTORIAL" ? "bg-ochre" : "bg-lapis")} />
                              <span className="font-mono text-[0.7rem] font-semibold leading-tight">{e.subject?.code}</span>
                              <span className="truncate text-[0.7rem] leading-tight text-muted">{e.subject?.name}</span>
                              <span className="mt-auto flex flex-wrap items-center gap-x-1.5 pt-0.5 text-[0.65rem] leading-tight text-muted">
                                {view !== "faculty" && e.faculty && <span className="truncate">{e.faculty.name}</span>}
                                {view !== "room" && e.room && (
                                  <span className="font-mono text-graphite-500">{e.room.block}-{e.room.code}</span>
                                )}
                                {view !== "section" && e.section && (
                                  <span className="font-mono text-graphite-500">§{e.section.number}</span>
                                )}
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
        )}

        {!id && data?.published && (
          <p className="mt-3 text-center text-[0.8125rem] text-muted">
            Showing every session. Pick a {view} above to narrow it down.
          </p>
        )}
      </main>
    </div>
  );
}
