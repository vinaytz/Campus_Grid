"use client";
import { use, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Globe, ShieldCheck, CalendarRange, RefreshCw } from "lucide-react";
import { api, useResource } from "@/hooks/useApi";
import { Studio } from "@/components/studio/Studio";
import { SemesterView, type Session, type TeachingDay } from "@/components/timetable/SemesterView";
import { GenerationReport, type Report } from "@/components/timetable/GenerationReport";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Segmented } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import type { LiteEntry, LiteRoom, LiteSlot, Rules } from "@/lib/scheduler/validate";

type Detail = Report & {
  _id: string; name: string; status: string; academicYear: string; term: string;
  entries: LiteEntry[];
  sessions: Session[];
  teachingDays: TeachingDay[];
  semesterDoc?: { name: string; startDate: string; endDate: string };
};

type Tab = "semester" | "pattern";

export default function TimetableStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { push } = useToast();
  const [tab, setTab] = useState<Tab>("semester");
  const [publishing, setPublishing] = useState(false);
  const [validating, setValidating] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [confirmExpand, setConfirmExpand] = useState(false);

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

  /** Re-expands the weekly pattern across the calendar after Studio edits. */
  async function applyPattern() {
    setExpanding(true);
    try {
      const res = await api<{ scheduled: number; requested: number; trimmed: number; added: number }>(
        `/api/timetables/${id}/layout`, { method: "POST" }
      );
      push(
        `Expanded to ${res.scheduled} of ${res.requested} required sessions` +
        (res.trimmed ? `, trimmed ${res.trimmed}` : "") +
        (res.added ? `, topped up ${res.added}` : "") + "."
      );
      await reload();
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setExpanding(false);
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
            <h1 className="font-display text-[1.6rem] leading-none tracking-[-0.022em]">{data.name}</h1>
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
      <Modal
        open={confirmExpand}
        onClose={() => setConfirmExpand(false)}
        title="Re-expand weekly pattern?"
        description="Dated sessions will be rebuilt and reconciled to exact assignment counts. Pinned sessions and extra classes are kept."
        footer={<>
          <Button variant="ghost" onClick={() => setConfirmExpand(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => { setConfirmExpand(false); void applyPattern(); }} loading={expanding}>Re-expand</Button>
        </>}
      ><div /></Modal>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "semester", label: "Semester" },
            { value: "pattern", label: "Weekly pattern" },
          ]}
        />
        {tab === "pattern" && !published && (
          <Button variant="secondary" size="sm" onClick={() => setConfirmExpand(true)} loading={expanding}>
            <RefreshCw className="size-3.5" /> Apply pattern to semester
          </Button>
        )}
      </div>

      {tab === "semester" ? (
        (data.teachingDays?.length ?? 0) === 0 ? (
          <div className="rounded-md border border-dashed border-rule-strong bg-sheet px-6 py-12 text-center">
            <CalendarRange className="mx-auto mb-3 size-5 text-muted" />
            <p className="font-display text-base">No semester calendar attached</p>
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
            readOnly={published}
            onChanged={reload}
          />
        )
      ) : (
        <>
          <p className="mb-3 max-w-3xl text-[0.8125rem] leading-relaxed text-muted">
            This is the recurring weekly template, not the deliverable. Rearranging it
            changes the shape of a typical week; use <em>Apply pattern to semester</em> to
            rebuild the dated sessions from it and reconcile them back to each
            assignment&apos;s exact required total.
          </p>
          <Studio
            timetableId={id}
            initialEntries={data.entries}
            assignments={assignments}
            slots={slots}
            rooms={rooms}
            rules={rules}
            teachingWeeks={
              data.teachingDays?.length
                ? new Set(data.teachingDays.map((d) => d.week)).size
                : undefined
            }
            readOnly={published}
          />
        </>
      )}
    </>
  );
}
