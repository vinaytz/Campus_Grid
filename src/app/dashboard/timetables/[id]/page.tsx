"use client";
import { use, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Globe, ShieldCheck, CalendarRange } from "lucide-react";
import { api, useResource } from "@/hooks/useApi";
import { SemesterView, type Session, type TeachingDay } from "@/components/timetable/SemesterView";
import { GenerationReport, type Report } from "@/components/timetable/GenerationReport";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import type { LiteEntry, LiteRoom, LiteSlot, SchedulingRules } from "@/lib/scheduler/validate";

type Detail = Report & {
  _id: string; name: string; status: string; academicYear: string; term: string;
  entries: LiteEntry[];
  sessions: Session[];
  teachingDays: TeachingDay[];
  semesterDoc?: { name: string; startDate: string; endDate: string };
};

export default function TimetableStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { push } = useToast();
  const [publishing, setPublishing] = useState(false);
  const [validating, setValidating] = useState(false);

  const { data, loading, reload } = useResource<Detail>(`/api/timetables/${id}`);
  const { data: slots } = useResource<LiteSlot[]>("/api/admin/slots");
  const { data: rooms } = useResource<LiteRoom[]>("/api/admin/rooms");
  const { data: assignments } = useResource<any[]>("/api/admin/assignments");
  const { data: settings } = useResource<any>("/api/settings");

  const schedulingRules = useMemo<SchedulingRules | null>(() => settings ? {
    workingDays: settings.workingDays,
    maxHoursPerDayPerSection: settings.maxHoursPerDayPerSection,
    maxConsecutiveHoursPerFaculty: settings.maxConsecutiveHoursPerFaculty,
    allowSessionsAcrossBreak: settings.allowSessionsAcrossBreak,
    maxSessionsPerAssignmentPerDay: settings.maxSessionsPerAssignmentPerDay ?? 1,
  } : null, [settings]);

  async function validate() {
    setValidating(true);
    try {
      const res = await api<{ publishable: boolean; hardViolations: unknown[]; countMismatches: unknown[] }>(
        `/api/timetables/${id}/validate`, { method: "POST" }
      );
      push(res.publishable
        ? "Validated — no hard violations and every session count is exact."
        : `Not publishable: ${res.hardViolations.length} hard violation(s), ${res.countMismatches.length} count mismatch(es).`,
        res.publishable ? "ok" : "error");
      await reload();
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setValidating(false);
    }
  }

  async function publish() {
    setPublishing(true);
    try {
      await api(`/api/timetables/${id}`, { method: "PATCH", json: { status: "PUBLISHED" } });
      push("Published to the public board.");
      await reload();
    } catch (e) {
      push((e as Error).message, "error");
      await reload(); // the server records why it refused; surface it in the report
    } finally {
      setPublishing(false);
    }
  }

  async function unpublish() {
    try {
      await api(`/api/timetables/${id}`, { method: "PATCH", json: { status: "DRAFT" } });
      push("Moved back to draft. You can edit it again.");
      await reload();
    } catch (e) {
      push((e as Error).message, "error");
    }
  }

  const ready = data && slots && rooms && assignments && schedulingRules;

  if (loading || !ready) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-1 w-40 overflow-hidden rounded-full bg-ink/10">
          <div className="sweeping h-full w-full animate-sweep rounded-full" />
        </div>
      </div>
    );
  }

  const published = data.status === "PUBLISHED";
  const publishable = !!data.validation?.publishable;

  return (
    <>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/dashboard/timetables"
            className="mb-2 inline-flex items-center gap-1 text-micro text-muted transition-colors hover:text-ink">
            <ArrowLeft className="size-3" /> Timetables
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-sans text-xl leading-tight tracking-tight text-ink">{data.name}</h1>
            <Badge tone={published ? "moss" : data.status === "ARCHIVED" ? "neutral" : "ochre"}>
              {data.status}
            </Badge>
          </div>
          <p className="mt-1.5 font-mono text-micro text-muted">
            {data.semesterDoc
              ? `${data.semesterDoc.name} · ${data.semesterDoc.startDate} → ${data.semesterDoc.endDate} · ${data.teachingDays?.length ?? 0} teaching days`
              : `${data.term} term · ${data.academicYear} · no semester calendar attached`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" target="_blank">
            <Button variant="ghost" size="sm"><Globe className="size-3.5" /> View board</Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={validate} loading={validating}>
            <ShieldCheck className="size-3.5" /> Validate
          </Button>
          {published ? (
            <Button size="sm" variant="ghost" onClick={unpublish}>Back to draft</Button>
          ) : (
            <Button
              size="sm" onClick={publish} loading={publishing}
              disabled={!publishable}
              title={publishable
                ? "Publish to the public board"
                : "Publishing is blocked until validation passes with no hard violations and exact session counts"}
            >
              Publish
            </Button>
          )}
        </div>
      </header>

      <GenerationReport report={data} />

      {
        (data.teachingDays?.length ?? 0) === 0 ? (
          <div className="rounded-md border border-dashed border-line bg-surface px-6 py-8 text-center">
            <CalendarRange className="mx-auto mb-3 size-5 text-muted" />
            <p className="font-sans text-base text-muted">No semester calendar attached</p>
            <p className="mx-auto mt-1 max-w-md text-[0.8125rem] text-muted">
              This timetable has no semester, so its classes have no dates to sit on.
              Set one up, then generate again.
            </p>
            <Link href="/dashboard/semester" className="mt-3 inline-block">
              <Button size="sm" variant="secondary">Set up the semester</Button>
            </Link>
          </div>
        ) : (
          <SemesterView
            timetableId={id}
            sessions={data.sessions ?? []}
            slots={slots as any}
            teachingDays={data.teachingDays}
            rooms={rooms as any}
            assignments={assignments as any}
            readOnly={published}
            onChanged={() => reload({ preserveData: true })}
          />
        )
      }
    </>
  );
}
