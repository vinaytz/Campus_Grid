"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { TimetableGrid, type GridDay, type GridEntry, type GridSlot } from "@/components/timetable/TimetableGrid";
import { useResource } from "@/hooks/useApi";
import { Segmented, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { prettyDate } from "@/lib/constants";
import { cn } from "@/lib/utils";

type View = "section" | "faculty" | "room";
type Mode = "week" | "typical";
type Directory = {
  sections: { _id: string; number: string; program: string; semester: number }[];
  faculty: { _id: string; name: string; facultyId: string; department: string }[];
  rooms: { _id: string; code: string; block: string; type: string }[];
};
type Calendar = { week: number; weeks: number; start: string; end: string; days: GridDay[] };
type Payload = {
  published: boolean;
  university: { name: string; code: string; slug: string };
  publishedSemesters: { id: string | null; name: string; academicYear: string; term: string }[];
  slots: GridSlot[];
  entries: GridEntry[];
  sessions: GridEntry[];
  calendar: Calendar | null;
  directory: Directory;
  semester: { name: string; startDate: string; endDate: string; teachingWeekdays: number[] } | null;
};

/** The viewer's own calendar date, so "this week" matches their clock. */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PublicUniversity({ slug }: { slug: string }) {
  const [semester, setSemester] = useState("");
  const [view, setView] = useState<View>("section");
  const [resourceId, setResourceId] = useState("");
  const [mode, setMode] = useState<Mode>("week");
  /** null = the week containing today; set once the visitor navigates. */
  const [week, setWeek] = useState<number | null>(null);
  const [today] = useState(localToday);

  const url = `/api/public?university=${encodeURIComponent(slug)}`
    + (semester ? `&semester=${encodeURIComponent(semester)}` : "")
    + `&view=${view}`
    + (resourceId ? `&id=${encodeURIComponent(resourceId)}` : "")
    + (week !== null ? `&week=${week}` : `&date=${today}`);
  const { data, loading, error } = useResource<Payload>(url);

  const semesters = data?.publishedSemesters ?? [];
  const selectedSemester = semester || semesters[0]?.id || "";
  const calendar = data?.calendar ?? null;
  const dated = mode === "week" && calendar !== null;

  const options = useMemo(() => {
    if (!data) return [];
    const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" · ");
    if (view === "faculty") return data.directory.faculty.map((item) => ({ id: item._id, label: join(item.name, item.department) }));
    if (view === "room") return data.directory.rooms.map((item) => ({ id: item._id, label: `${item.block}-${item.code} · ${item.type}` }));
    return data.directory.sections.map((item) => ({ id: item._id, label: join(item.number, item.program) }));
  }, [data, view]);

  /** Steps from the week already requested, so quick clicks don't collapse into one. */
  const step = (by: number) => setWeek((current) => {
    const from = current ?? calendar?.week ?? 1;
    return Math.min(calendar?.weeks ?? from + by, Math.max(1, from + by));
  });

  return (
    <div className="min-h-dvh bg-ground">
      <header className="chrome text-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.12em] text-white/70 hover:text-white"><ArrowLeft className="size-3.5" /> All universities</Link>
          <Link href="/login" className="inline-flex items-center gap-1 font-mono text-[0.65rem] uppercase tracking-[0.1em] text-white/65 hover:text-white">Admin login <ArrowUpRight className="size-3" /></Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-8 sm:py-14">
        {error ? <div className="rounded-md border border-dashed border-ochre bg-surface px-6 py-16 text-center text-sm text-muted">{error}</div> : (
          <>
            <p className="eyebrow mb-3">Published timetable</p>
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div><h1 className="font-sans text-3xl tracking-tight text-ink sm:text-4xl">{data?.university.name ?? slug}</h1><p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-muted">{data?.university.code}</p></div>
              {semesters.length > 0 && <Select label="Semester" value={selectedSemester} onChange={(event) => { setSemester(event.target.value); setResourceId(""); setWeek(null); }} className="min-w-56">{semesters.map((item) => <option key={item.id ?? item.name} value={item.id ?? ""}>{item.name} · {item.academicYear}</option>)}</Select>}
            </div>
            {loading && !data ? <div className="mt-8 rounded-md border border-line bg-surface px-6 py-16 text-center text-sm text-muted">Loading published timetable...</div> : !data?.published ? <div className="mt-8 rounded-md border border-dashed border-line bg-surface px-6 py-16 text-center text-sm text-muted">No timetable has been published for this university.</div> : (
              <>
                <div className="mt-8 grid gap-4 rounded-md border border-line bg-surface p-4 shadow-sheet sm:grid-cols-[auto_1fr] sm:items-end">
                  <Segmented<View> value={view} onChange={(next) => { setView(next); setResourceId(""); }} options={[{ value: "section", label: "Section" }, { value: "faculty", label: "Faculty" }, { value: "room", label: "Room" }]} />
                  <Select label={`Choose ${view}`} value={resourceId} onChange={(event) => setResourceId(event.target.value)}><option value="">All {view}s</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</Select>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {calendar && (
                    <Segmented<Mode> value={mode} onChange={setMode} options={[{ value: "week", label: "This week" }, { value: "typical", label: "Typical week" }]} />
                  )}
                  {dated && calendar && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" aria-label="Previous week" disabled={calendar.week <= 1} onClick={() => step(-1)}>
                        <ChevronLeft className="size-3.5" />
                      </Button>
                      <span className="min-w-[13rem] text-center font-mono text-micro font-semibold uppercase tracking-[0.08em] tnum">
                        Week {calendar.week} of {calendar.weeks}
                        <span className="ml-2 font-normal normal-case tracking-normal text-muted">
                          {prettyDate(calendar.start).split(" ").slice(1).join(" ")} – {prettyDate(calendar.end).split(" ").slice(1).join(" ")}
                        </span>
                      </span>
                      <Button variant="ghost" size="sm" aria-label="Next week" disabled={calendar.week >= calendar.weeks} onClick={() => step(1)}>
                        <ChevronRight className="size-3.5" />
                      </Button>
                      {week !== null && (
                        <Button variant="ghost" size="sm" onClick={() => setWeek(null)}>Today</Button>
                      )}
                    </div>
                  )}
                  {loading && <span className="text-micro text-muted" role="status">Loading…</span>}
                </div>

                <p className="mt-2 text-xs text-muted">
                  {dated
                    ? "The actual classes for this week, including holidays, moved classes and extra classes."
                    : "The regular weekly pattern. Individual weeks can differ because of holidays and changes — use This week to see real dates."}
                </p>

                <div className={cn("mt-3 transition-opacity", loading && "opacity-60")}>
                  {dated && calendar ? (
                    <TimetableGrid slots={data.slots} entries={data.sessions} datedDays={calendar.days} showFaculty={view !== "faculty"} showRoom={view !== "room"} />
                  ) : (
                    <TimetableGrid slots={data.slots} entries={data.entries} days={data.semester?.teachingWeekdays ?? [1, 2, 3, 4, 5]} showFaculty={view !== "faculty"} showRoom={view !== "room"} />
                  )}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
