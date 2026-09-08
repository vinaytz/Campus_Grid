"use client";

import Link from "next/link";
import { Search, ArrowUpRight, Building2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useResource } from "@/hooks/useApi";

type UniversityCard = {
  name: string;
  code: string;
  slug: string;
  publishedSemesters: number;
};

export default function PublicDirectory() {
  const { data, loading, error } = useResource<UniversityCard[]>("/api/public/universities");
  const [query, setQuery] = useState("");
  const universities = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data ?? []).filter((university) =>
      !normalized || `${university.name} ${university.code}`.toLowerCase().includes(normalized)
    );
  }, [data, query]);

  return (
    <div className="min-h-dvh bg-ground">
      <header className="chrome text-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-8">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-md bg-surface/10 font-sans text-xl">C</span>
            <div>
              <span className="block font-sans text-sm">Campus Grid</span>
              <span className="block font-mono text-[0.52rem] uppercase tracking-[0.16em] text-white/35">Public timetables</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/login" className="rounded-md border border-white/15 px-3 py-2 font-mono text-[0.65rem] uppercase tracking-[0.1em] text-white/70 hover:bg-white/10 hover:text-white">University Admin</Link>
            <Link href="/adminLogin" className="hidden items-center gap-1 rounded-md border border-white/15 px-3 py-2 font-mono text-[0.65rem] uppercase tracking-[0.1em] text-white/70 hover:bg-white/10 hover:text-white sm:inline-flex">Platform Admin <ArrowUpRight className="size-3" /></Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-14 sm:px-8 sm:py-20">
        <p className="eyebrow mb-3">Open timetable directory</p>
        <h1 className="max-w-2xl font-sans text-4xl leading-tight tracking-tight text-ink sm:text-5xl">Find your university&apos;s timetable</h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">Choose a university to view its published semester timetable. Draft and private schedules are never shown here.</p>

        <div className="relative mt-9 max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search universities..." aria-label="Search universities" className="h-12 w-full rounded-md border border-line bg-surface pl-10 pr-4 text-sm text-ink shadow-sheet outline-none focus:border-accent focus:ring-4 focus:ring-accent/10" />
        </div>

        {loading ? <div className="mt-10 rounded-md border border-line bg-surface px-6 py-16 text-center text-sm text-muted">Loading universities...</div> :
          error ? <div className="mt-10 rounded-md border border-dashed border-ochre bg-surface px-6 py-16 text-center text-sm text-muted">{error}</div> :
          universities.length === 0 ? <div className="mt-10 rounded-md border border-dashed border-line bg-surface px-6 py-16 text-center text-sm text-muted">No universities match your search.</div> :
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {universities.map((university) => (
              <Link key={university.slug} href={`/u/${encodeURIComponent(university.slug)}`} className="group rounded-md border border-line bg-surface p-5 shadow-sheet transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-lift">
                <div className="flex items-start justify-between gap-4">
                  <span className="flex size-10 items-center justify-center rounded-md bg-claret-soft text-ink"><Building2 className="size-5" /></span>
                  <ArrowUpRight className="size-4 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
                </div>
                <h2 className="mt-5 font-sans text-xl font-semibold tracking-tight text-ink">{university.name}</h2>
                <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-muted">{university.code}</p>
                <p className="mt-5 text-xs text-muted">{university.publishedSemesters} published semester{university.publishedSemesters === 1 ? "" : "s"}</p>
              </Link>
            ))}
          </div>}
      </main>
    </div>
  );
}
