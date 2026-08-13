"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ArrowUpRight, Clock3, MapPin } from "lucide-react";
import { useResource } from "@/hooks/useApi";
import { TimetableGrid, type GridEntry, type GridSlot } from "@/components/timetable/TimetableGrid";
import { Segmented } from "@/components/ui/Field";
import { Swatch } from "@/components/ui/Badge";
import { cn, prettyTime } from "@/lib/utils";
import { DAY_NAMES } from "@/lib/constants";

type View = "section" | "faculty" | "room";
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
  meta: { name: string; academicYear: string; term: string } | null;
};

export default function PublicBoard() {
  const [view, setView] = useState<View>("section");
  const [id, setId] = useState("");
  const [query, setQuery] = useState("");

  const { data, loading } = useResource<Payload>(
    `/api/public?view=${view}${id ? `&id=${id}` : ""}`
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

  const today = new Date().getDay();
  const todays = (data?.entries ?? [])
    .filter((e) => e.day === today)
    .sort((a, b) => a.slotOrder - b.slotOrder);

  return (
    <div className="min-h-dvh bg-ground">
      {/* Chrome bar — the same graphite frame as the admin tool */}
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
        {/* Title block, drawn like the one on a technical sheet */}
        <div className="mb-8 border-b border-rule-strong pb-6">
          <p className="label mb-2">
            {data?.meta ? `${data.meta.term} term · ${data.meta.academicYear}` : "Class schedule"}
          </p>
          <h1 className="font-display text-[2.1rem] leading-[1.05] tracking-[-0.028em] sm:text-[2.75rem]">
            {selected ? (
              view === "section" ? <>Section <span className="tnum">{selected.primary}</span></>
                : selected.primary
            ) : "Find your week"}
          </h1>
          <p className="mt-3 max-w-lg text-[0.875rem] leading-relaxed text-muted">
            {selected
              ? selected.secondary
              : "Look up the published timetable by section, by the faculty member teaching, or by room."}
          </p>
        </div>

        {/* Picker */}
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

        {/* Today, when a subject is selected — the answer most people came for */}
        <AnimatePresence>
          {id && todays.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.2, 0.9, 0.3, 1] }}
              className="mb-6 rounded-md border border-rule bg-sheet shadow-hair"
            >
              <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
                <span className="label">{DAY_NAMES[today]} — today</span>
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
                        </span>
                        <span className="block truncate text-[0.7rem] text-muted">{e.faculty?.name}</span>
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

        {/* The week */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="label">Full week</h2>
          <div className="flex items-center gap-3 text-[0.68rem] text-muted">
            <span className="flex items-center gap-1"><Swatch kind="LECTURE" /> Lecture</span>
            <span className="flex items-center gap-1"><Swatch kind="LAB" /> Lab</span>
            <span className="flex items-center gap-1"><Swatch kind="TUTORIAL" /> Tutorial</span>
          </div>
        </div>

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
        ) : (
          <TimetableGrid
            slots={data.slots} entries={data.entries} days={days}
            showFaculty={view !== "faculty"} showRoom={view !== "room"}
          />
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
