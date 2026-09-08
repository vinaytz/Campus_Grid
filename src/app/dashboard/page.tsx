"use client";
import Link from "next/link";
// framer-motion removed per motion policy; interactions remain user-driven
import { ArrowRight, Check, CalendarRange, AlertTriangle } from "lucide-react";
import { useResource } from "@/hooks/useApi";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Panel, PanelHead, Stat } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type Stats = {
  faculty: number; subjects: number; rooms: number; sections: number;
  assignments: number;
  semesterSessions: number; semesterPeriods: number;
  capacity: number; slots: number; teachingDays: number; weeks: number;
  semester: { _id: string; name: string; startDate: string; endDate: string } | null;
  published: number;
  latest: {
    _id: string; name: string; status: string;
    stats: { requested: number; scheduled: number };
    validation?: { publishable?: boolean };
  } | null;
};

const SETUP = [
  { key: "slots", label: "Define the daily periods", href: "/dashboard/slots" },
  { key: "rooms", label: "Add rooms with capacity and capabilities", href: "/dashboard/rooms" },
  { key: "faculty", label: "Add faculty with their IDs", href: "/dashboard/faculty" },
  { key: "subjects", label: "Add subjects with their codes", href: "/dashboard/subjects" },
  { key: "sections", label: "Add sections with student counts", href: "/dashboard/sections" },
  { key: "assignments", label: "Map teaching load with exact session counts", href: "/dashboard/assignments" },
  { key: "semester", label: "Set the semester dates and holidays", href: "/dashboard/semester" },
] as const;

export default function Overview() {
  const { data, loading } = useResource<Stats>("/api/stats");

  const counts: Record<string, number> = {
    slots: data?.slots ?? 0, rooms: data?.rooms ?? 0, faculty: data?.faculty ?? 0,
    subjects: data?.subjects ?? 0, sections: data?.sections ?? 0,
    assignments: data?.assignments ?? 0,
    semester: data?.teachingDays ?? 0,
  };
  const done = SETUP.filter((s) => counts[s.key] > 0).length;
  const ready = done === SETUP.length;

  const tiles = [
    { label: "Faculty", value: data?.faculty, href: "/dashboard/faculty" },
    { label: "Subjects", value: data?.subjects, href: "/dashboard/subjects" },
    { label: "Rooms", value: data?.rooms, href: "/dashboard/rooms" },
    { label: "Sections", value: data?.sections, href: "/dashboard/sections" },
  ];

  // Demand against supply over the whole term, which is what decides feasibility.
  const pressure = data?.capacity
    ? Math.round((data.semesterPeriods / data.capacity) * 100)
    : 0;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Summary"
        description="What the scheduler knows about, and how much of the semester's teaching it has to place."
        action={
          <Link href="/dashboard/timetables">
            <Button variant="primary" size="sm">Open timetables <ArrowRight className="size-3.5" /></Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <div key={t.label}>
            <Link href={t.href}>
              <Panel className="group relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40">
                <span className="absolute right-0 top-0 size-20 rounded-full bg-accent/5 blur-2xl" />
                <Stat label={t.label} value={loading ? "—" : t.value ?? 0} />
                <span className="mt-5 block font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted/70">Open directory →</span>
              </Panel>
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_.7fr]">
        <Panel className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-lapis/10 blur-3xl" />
          <PanelHead
            title="Semester load"
            action={data?.semester
              ? <Link href="/dashboard/semester" className="font-mono text-[0.68rem] text-muted hover:text-ink">
                  {data.semester.name}
                </Link>
              : undefined}
          />
          <div className="relative flex flex-wrap items-end gap-x-12 gap-y-5">
            <Stat
              label="Sessions to place"
              value={loading ? "—" : data?.semesterSessions ?? 0}
              sub="exact totals across every assignment"
            />
            <Stat
              label="Teaching days"
              value={loading ? "—" : data?.teachingDays ?? 0}
              sub={data?.weeks ? `over ${data.weeks} weeks` : "no semester calendar yet"}
            />
            <Stat
              label="Room-periods available"
              value={loading ? "—" : data?.capacity ?? 0}
              sub="teaching days × periods × rooms"
            />
          </div>

          {data && data.capacity > 0 && (
            <div className="relative rule-t mt-6 pt-4">
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="label">Pressure on the calendar</span>
                <span className="font-mono text-[0.68rem] text-muted tnum">{pressure}%</span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-ink/10">
                <div className={cn(
                  "h-full rounded-full",
                  pressure > 70 ? "bg-claret" : pressure > 40 ? "bg-ochre" : "bg-moss"
                )} style={{ width: `${Math.min(100, pressure)}%` }} />
              </div>
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
                {pressure > 70
                  ? "Demand is close to what the term can supply. Generation will be slow and shortfalls are likely — add rooms or periods."
                  : "Comfortable. There is room for the optimiser to balance loads and protect afternoon breaks."}
              </p>
            </div>
          )}

          {data && !data.semester && (
            <p className="rule-t mt-4 flex items-start gap-1.5 pt-3 text-[0.8125rem] text-ochre">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                No semester calendar exists yet, so nothing can be generated.{" "}
                <Link href="/dashboard/semester" className="underline">Set one up</Link>.
              </span>
            </p>
          )}
        </Panel>

        <Panel className="bg-graphite-950 text-white shadow-lift">
          <PanelHead
            title="Setup"
            action={<span className="font-mono text-[0.68rem] text-white/45 tnum">{done}/{SETUP.length}</span>}
          />
          {ready ? (
            <div>
              <Badge tone="moss"><Check className="size-2.5" /> Ready to generate</Badge>
              <p className="mt-3 text-[0.8125rem] leading-relaxed text-white/55">
                Every prerequisite is in place. Generate a semester draft, review it week
                by week, then publish.
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {SETUP.map((s) => {
                const complete = counts[s.key] > 0;
                return (
                  <li key={s.key}>
                    <Link href={s.href} className="group flex items-center gap-2.5 text-[0.8125rem]">
                      <span className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-xs border transition-colors",
                        complete ? "border-moss bg-moss text-white" : "border-rule-strong text-transparent"
                      )}>
                        <Check className="size-2.5" />
                      </span>
                      <span className={cn(
                        "transition-colors",
                        complete ? "text-white/35 line-through" : "text-white/80 group-hover:text-white"
                      )}>
                        {s.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {data?.latest && (
        <Panel className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-sm bg-ink/[.05]">
                <CalendarRange className="size-4 text-muted" />
              </span>
              <div>
                <p className="label">Most recent draft</p>
                <p className="mt-0.5 text-[0.9rem] font-medium">{data.latest.name}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={data.latest.status === "PUBLISHED" ? "moss" : "ochre"}>{data.latest.status}</Badge>
              {data.latest.validation?.publishable && (
                <Badge tone="moss"><Check className="size-2.5" /> Valid</Badge>
              )}
              <span className="font-mono text-[0.8125rem] text-muted tnum">
                {data.latest.stats.scheduled}/{data.latest.stats.requested} sessions
              </span>
              <Link href={`/dashboard/timetables/${data.latest._id}`}>
                <Button size="sm">Review</Button>
              </Link>
            </div>
          </div>
        </Panel>
      )}
    </>
  );
}
