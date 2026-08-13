"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Check, CalendarRange } from "lucide-react";
import { useResource } from "@/hooks/useApi";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Panel, PanelHead, Stat } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type Stats = {
  faculty: number; subjects: number; rooms: number; sections: number;
  assignments: number; weeklySessions: number; seatCapacity: number; published: number;
  latest: { _id: string; name: string; status: string; stats: { requested: number; placed: number } } | null;
};

const SETUP = [
  { key: "slots", label: "Define the daily periods", href: "/dashboard/slots" },
  { key: "rooms", label: "Add rooms with seating capacity", href: "/dashboard/rooms" },
  { key: "faculty", label: "Add faculty with their IDs", href: "/dashboard/faculty" },
  { key: "subjects", label: "Add subjects with their codes", href: "/dashboard/subjects" },
  { key: "sections", label: "Add sections with student counts", href: "/dashboard/sections" },
  { key: "assignments", label: "Map faculty to subjects per section", href: "/dashboard/assignments" },
] as const;

export default function Overview() {
  const { data, loading } = useResource<Stats>("/api/stats");

  const counts: Record<string, number> = {
    slots: 1, rooms: data?.rooms ?? 0, faculty: data?.faculty ?? 0,
    subjects: data?.subjects ?? 0, sections: data?.sections ?? 0,
    assignments: data?.assignments ?? 0,
  };
  const done = SETUP.filter((s) => counts[s.key] > 0).length;
  const ready = done === SETUP.length;

  const tiles = [
    { label: "Faculty", value: data?.faculty, href: "/dashboard/faculty" },
    { label: "Subjects", value: data?.subjects, href: "/dashboard/subjects" },
    { label: "Rooms", value: data?.rooms, href: "/dashboard/rooms" },
    { label: "Sections", value: data?.sections, href: "/dashboard/sections" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Summary"
        description="What the scheduler knows about, and how close the current draft is to a complete week."
        action={
          <Link href="/dashboard/timetables">
            <Button variant="primary" size="sm">Open timetables <ArrowRight className="size-3.5" /></Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <motion.div key={t.label}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: i * 0.03, ease: [0.2, 0.9, 0.3, 1] }}>
            <Link href={t.href}>
              <Panel className="transition-colors duration-150 hover:border-graphite-400">
                <Stat label={t.label} value={loading ? "—" : t.value ?? 0} />
              </Panel>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <Panel>
          <PanelHead title="Weekly load" />
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <Stat
              label="Periods to place"
              value={loading ? "—" : data?.weeklySessions ?? 0}
              sub="across every active assignment"
            />
            <Stat
              label="Room-periods per day"
              value={loading ? "—" : data?.seatCapacity ?? 0}
              sub="teaching periods × bookable rooms"
            />
            <Stat
              label="Assignments"
              value={loading ? "—" : data?.assignments ?? 0}
              sub="faculty ↔ subject ↔ section"
            />
          </div>
          <p className="rule-t mt-4 pt-3 text-[0.8125rem] leading-relaxed text-muted">
            As weekly load approaches the room-periods available across the week, generation
            slows and gaps start appearing. Add rooms or periods before it gets tight.
          </p>
        </Panel>

        <Panel>
          <PanelHead
            title="Setup"
            action={
              <span className="font-mono text-[0.68rem] text-muted tnum">{done}/{SETUP.length}</span>
            }
          />
          {ready ? (
            <div>
              <Badge tone="moss"><Check className="size-2.5" /> Ready to generate</Badge>
              <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
                Every prerequisite is in place. Generate a draft, then arrange it on the canvas.
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
                        complete ? "text-muted line-through" : "text-ink group-hover:text-claret"
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
            <div className="flex items-center gap-3">
              <Badge tone={data.latest.status === "PUBLISHED" ? "moss" : "ochre"}>{data.latest.status}</Badge>
              <span className="font-mono text-[0.8125rem] text-muted tnum">
                {data.latest.stats.placed}/{data.latest.stats.requested} placed
              </span>
              <Link href={`/dashboard/timetables/${data.latest._id}`}>
                <Button size="sm">Open canvas</Button>
              </Link>
            </div>
          </div>
        </Panel>
      )}
    </>
  );
}
