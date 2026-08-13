"use client";
import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Globe, AlertTriangle } from "lucide-react";
import { api, useResource } from "@/hooks/useApi";
import { Studio } from "@/components/studio/Studio";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import type { LiteEntry, LiteRoom, LiteSlot, Rules } from "@/lib/scheduler/validate";

type Detail = {
  _id: string; name: string; status: string; academicYear: string; term: string;
  entries: LiteEntry[];
  stats: { requested: number; placed: number; unplaced: { assignment: string; reason: string }[] };
};

export default function TimetableStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { push } = useToast();
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);

  const { data, loading, reload } = useResource<Detail>(`/api/timetables/${id}`);
  const { data: slots } = useResource<LiteSlot[]>("/api/admin/slots");
  const { data: rooms } = useResource<LiteRoom[]>("/api/admin/rooms");
  const { data: assignments } = useResource<any[]>("/api/admin/assignments");
  const { data: settings } = useResource<any>("/api/settings");

  const rules = useMemo<Rules | null>(() => settings ? {
    workingDays: settings.workingDays,
    maxHoursPerDayPerSection: settings.maxHoursPerDayPerSection,
    maxConsecutiveHoursPerFaculty: settings.maxConsecutiveHoursPerFaculty,
    allowSessionsAcrossBreak: settings.allowSessionsAcrossBreak,
  } : null, [settings]);

  async function publish() {
    setPublishing(true);
    try {
      await api(`/api/timetables/${id}`, { method: "PATCH", json: { status: "PUBLISHED" } });
      push("Published to the public board.");
      await reload();
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setPublishing(false);
    }
  }

  const ready = data && slots && rooms && assignments && rules;

  if (loading || !ready) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-1 w-40 overflow-hidden rounded-full bg-ink/10">
          <div className="sweeping h-full w-full animate-sweep rounded-full" />
        </div>
      </div>
    );
  }

  const gaps = data.stats?.unplaced ?? [];

  return (
    <>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/dashboard/timetables"
            className="mb-2 inline-flex items-center gap-1 text-micro text-muted transition-colors hover:text-ink">
            <ArrowLeft className="size-3" /> Timetables
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-[1.6rem] leading-none tracking-[-0.022em]">{data.name}</h1>
            <Badge tone={data.status === "PUBLISHED" ? "moss" : data.status === "ARCHIVED" ? "neutral" : "ochre"}>
              {data.status}
            </Badge>
          </div>
          <p className="mt-1.5 font-mono text-micro text-muted">
            {data.term} term · {data.academicYear}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/" target="_blank">
            <Button variant="ghost" size="sm"><Globe className="size-3.5" /> View board</Button>
          </Link>
          {data.status !== "PUBLISHED" && (
            <Button size="sm" onClick={publish} loading={publishing}>Publish</Button>
          )}
        </div>
      </header>

      {gaps.length > 0 && (
        <div className="mb-4 rounded-md border border-ochre-line bg-ochre-soft/60 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-ochre">
            <AlertTriangle className="size-3.5" />
            {gaps.length} session{gaps.length === 1 ? "" : "s"} the solver could not place
          </p>
          <ul className="mt-2 space-y-1">
            {gaps.slice(0, 4).map((g, i) => (
              <li key={i} className="text-[0.8125rem] leading-snug">
                <span className="font-mono text-[0.72rem] font-semibold">{g.assignment}</span>
                <span className="ml-2 text-muted">{g.reason}</span>
              </li>
            ))}
          </ul>
          {gaps.length > 4 && <p className="mt-1.5 font-mono text-micro text-muted">+{gaps.length - 4} more</p>}
        </div>
      )}

      <Studio
        timetableId={id}
        initialEntries={data.entries}
        assignments={assignments}
        slots={slots}
        rooms={rooms}
        rules={rules}
      />
    </>
  );
}
