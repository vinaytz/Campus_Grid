"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useMemo, useState } from "react";
import { TimetableGrid, type GridEntry, type GridSlot } from "@/components/timetable/TimetableGrid";
import { useResource } from "@/hooks/useApi";
import { Segmented, Select } from "@/components/ui/Field";

type View = "section" | "faculty" | "room";
type Directory = {
  sections: { _id: string; number: string; program: string; semester: number }[];
  faculty: { _id: string; name: string; facultyId: string; department: string }[];
  rooms: { _id: string; code: string; block: string; type: string }[];
};
type Payload = {
  published: boolean;
  university: { name: string; code: string; slug: string };
  publishedSemesters: { id: string | null; name: string; academicYear: string; term: string }[];
  slots: GridSlot[];
  entries: GridEntry[];
  sessions: { _id?: string; date: string; slotOrder: number; duration: number; subject?: { code: string; name: string }; section?: { number: string }; faculty?: { name: string }; room?: { code: string; block: string } }[];
  directory: Directory;
  semester: { name: string; startDate: string; endDate: string; teachingWeekdays: number[] } | null;
};

export default function PublicUniversity({ slug }: { slug: string }) {
  const [semester, setSemester] = useState("");
  const [view, setView] = useState<View>("section");
  const [resourceId, setResourceId] = useState("");
  const { data, loading, error } = useResource<Payload>(`/api/public?university=${encodeURIComponent(slug)}${semester ? `&semester=${encodeURIComponent(semester)}` : ""}&view=${view}${resourceId ? `&id=${encodeURIComponent(resourceId)}` : ""}`);
  const semesters = data?.publishedSemesters ?? [];
  const selectedSemester = semester || semesters[0]?.id || "";
  const options = useMemo(() => {
    if (!data) return [];
    if (view === "faculty") return data.directory.faculty.map((item) => ({ id: item._id, label: `${item.name} · ${item.department}` }));
    if (view === "room") return data.directory.rooms.map((item) => ({ id: item._id, label: `${item.block}-${item.code} · ${item.type}` }));
    return data.directory.sections.map((item) => ({ id: item._id, label: `${item.number} · ${item.program}` }));
  }, [data, view]);

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
              {semesters.length > 0 && <Select label="Semester" value={selectedSemester} onChange={(event) => { setSemester(event.target.value); setResourceId(""); }} className="min-w-56">{semesters.map((item) => <option key={item.id ?? item.name} value={item.id ?? ""}>{item.name} · {item.academicYear}</option>)}</Select>}
            </div>
            {loading ? <div className="mt-8 rounded-md border border-line bg-surface px-6 py-16 text-center text-sm text-muted">Loading published timetable...</div> : !data?.published ? <div className="mt-8 rounded-md border border-dashed border-line bg-surface px-6 py-16 text-center text-sm text-muted">No timetable has been published for this university.</div> : (
              <>
                <div className="mt-8 grid gap-4 rounded-md border border-line bg-surface p-4 shadow-sheet sm:grid-cols-[auto_1fr] sm:items-end">
                  <Segmented<View> value={view} onChange={(next) => { setView(next); setResourceId(""); }} options={[{ value: "section", label: "Section" }, { value: "faculty", label: "Faculty" }, { value: "room", label: "Room" }]} />
                  <Select label={`Choose ${view}`} value={resourceId} onChange={(event) => setResourceId(event.target.value)}><option value="">All {view}s</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</Select>
                </div>
                <div className="mt-6"><TimetableGrid slots={data.slots} entries={data.entries} days={data.semester?.teachingWeekdays ?? [1, 2, 3, 4, 5]} showFaculty={view !== "faculty"} showRoom={view !== "room"} /></div>
                {data.sessions.length > 0 && (
                  <section className="mt-8 overflow-hidden rounded-md border border-line bg-surface shadow-sheet">
                    <div className="border-b border-line px-4 py-3"><p className="eyebrow">Dated semester sessions</p><p className="mt-1 text-xs text-muted">The published schedule across the selected semester.</p></div>
                    <div className="divide-y divide-line">
                      {data.sessions.slice(0, 80).map((session) => {
                        const slot = data.slots.find((item) => item.order === session.slotOrder);
                        return <div key={session._id ?? `${session.date}-${session.slotOrder}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                          <span className="w-24 shrink-0 font-mono text-xs text-muted">{session.date}</span>
                          <span className="font-mono text-xs font-semibold text-ink">{session.subject?.code}</span>
                          <span className="min-w-40 flex-1 text-muted">{session.subject?.name}</span>
                          <span className="text-xs text-muted">{slot?.start ?? "—"} · {session.room ? `${session.room.block}-${session.room.code}` : "—"}</span>
                        </div>;
                      })}
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
