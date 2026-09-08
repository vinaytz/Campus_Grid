"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Wand2, ShieldCheck, ShieldAlert } from "lucide-react";
import { api, useResource } from "@/hooks/useApi";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Table, TH, TD, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

type Row = {
  _id: string; name: string; status: string; academicYear: string; term: string;
  stats: { requested: number; scheduled: number; softScore?: number; feasible?: boolean };
  validation?: { publishable?: boolean; hardViolations?: unknown[]; countMismatches?: unknown[] };
};

type Semester = { _id: string; name: string; startDate: string; endDate: string; active: boolean };

export default function TimetablesPage() {
  const { push } = useToast();
  const router = useRouter();
  const { data, loading, reload } = useResource<Row[]>("/api/timetables");
  const { data: semesters } = useResource<Semester[]>("/api/admin/semesters");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [semester, setSemester] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    try {
      const res = await api<{ id: string; stats: Row["stats"] }>("/api/timetables", {
        method: "POST",
        json: {
          name: name || `Draft ${new Date().toLocaleDateString()}`,
          semester: semester || undefined,
        },
      });
      push(`Scheduled ${res.stats.scheduled} of ${res.stats.requested} required sessions.`);
      router.push(`/dashboard/timetables/${res.id}`);
    } catch (e) {
      push((e as Error).message, "error");
      setBusy(false);
    }
  }

  async function blank() {
    setBusy(true);
    try {
      const res = await api<{ id: string }>("/api/timetables", {
        method: "POST",
        json: { name: name || "Untitled", semester: semester || undefined, empty: true },
      });
      router.push(`/dashboard/timetables/${res.id}`);
    } catch (e) {
      push((e as Error).message, "error");
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await api(`/api/timetables/${id}`, { method: "DELETE" });
    push("Timetable deleted.");
    await reload();
  }

  const rows = data ?? [];
  const active = (semesters ?? []).find((s) => s.active);

  return (
    <>
      <PageHeader
        eyebrow="Build"
        title="Timetables"
        description="Generate a semester draft, review and edit it, validate it, then publish one to the public board."
        action={<Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" /> New timetable
        </Button>}
      />

      {rows.length === 0 && !loading ? (
        <div className="rounded-md border border-rule bg-sheet shadow-hair">
          <EmptyState
            title="No timetables yet"
            hint="With master data, teaching load and a semester calendar in place, generate your first draft — then review it week by week."
            action={<Button variant="primary" size="sm" onClick={() => setOpen(true)}>New timetable</Button>}
          />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <TH>Name</TH><TH>Term</TH><TH>Sessions</TH><TH>Soft score</TH>
              <TH>Valid</TH><TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const req = t.stats?.requested || 0;
              const done = t.stats?.scheduled ?? 0;
              const pct = req ? Math.round((done / req) * 100) : 0;
              const exact = req > 0 && done === req;
              const publishable = !!t.validation?.publishable;
              return (
                <tr key={t._id} className="transition-colors hover:bg-ink/[.02]">
                  <TD>
                    <Link href={`/dashboard/timetables/${t._id}`} className="font-medium hover:text-claret">
                      {t.name}
                    </Link>
                  </TD>
                  <TD className="font-mono text-micro text-muted">{t.term} · {t.academicYear}</TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-16 overflow-hidden rounded-full bg-ink/10">
                        <div className={cn("h-full rounded-full", exact ? "bg-moss" : "bg-claret")}
                          style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <span className="font-mono text-micro text-muted tnum">{done}/{req}</span>
                    </div>
                  </TD>
                  <TD className="font-mono text-micro tnum text-muted">
                    {t.stats?.softScore ?? "—"}
                  </TD>
                  <TD>
                    {publishable ? (
                      <span className="flex items-center gap-1 text-micro text-moss">
                        <ShieldCheck className="size-3.5" /> Passes
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-micro text-muted">
                        <ShieldAlert className="size-3.5" />
                        {(t.validation?.hardViolations?.length ?? 0) > 0
                          ? `${t.validation!.hardViolations!.length} violations`
                          : (t.validation?.countMismatches?.length ?? 0) > 0
                          ? `${t.validation!.countMismatches!.length} miscounts`
                          : "Unchecked"}
                      </span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={t.status === "PUBLISHED" ? "moss" : t.status === "ARCHIVED" ? "neutral" : "ochre"}>
                      {t.status}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Link href={`/dashboard/timetables/${t._id}`}>
                        <Button size="xs" variant="secondary">Review</Button>
                      </Link>
                      <Button size="xs" variant="ghost" className="hover:text-claret"
                        onClick={() => setDeleting(t._id)} aria-label="Delete">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TD>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <Modal
        open={open} onClose={() => !busy && setOpen(false)}
        title="New timetable"
        description="Generate a full semester draft, or start from an empty sheet you fill in yourself."
        footer={<Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>}
      >
        <div className="space-y-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Odd term — draft 1" />

          <Select
            label="Semester"
            hint={active ? undefined : "none marked active"}
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
          >
            <option value="">
              {active ? `${active.name} (active)` : "Choose a semester"}
            </option>
            {(semesters ?? []).map((s) => (
              <option key={s._id} value={s._id}>
                {s.name} · {s.startDate} → {s.endDate}
              </option>
            ))}
          </Select>

          {(semesters?.length ?? 0) === 0 && (
            <p className="rounded border border-ochre-line bg-ochre-soft/60 px-3 py-2 text-[0.8125rem] text-ochre">
              No semester calendar exists yet. Generation needs one to know which dates
              can hold classes.{" "}
              <Link href="/dashboard/semester" className="underline">Set one up first</Link>.
            </p>
          )}
        </div>

        <div className="mt-5 space-y-2">
          <button onClick={generate} disabled={busy || (semesters?.length ?? 0) === 0}
            className="w-full rounded border border-rule-strong/70 bg-sheet p-3 text-left transition-colors hover:border-claret disabled:opacity-50">
            <span className="flex items-center gap-2 text-[0.875rem] font-medium">
              <Wand2 className="size-4 text-claret" /> Generate the semester
            </span>
            <span className="mt-1 block text-[0.8125rem] leading-snug text-muted">
              Builds a weekly pattern, expands it across the calendar, reconciles every
              assignment to its exact session count, then validates the result.
            </span>
          </button>

          <button onClick={blank} disabled={busy}
            className="w-full rounded border border-rule-strong/70 bg-sheet p-3 text-left transition-colors hover:border-graphite-400 disabled:opacity-50">
            <span className="flex items-center gap-2 text-[0.875rem] font-medium">
              <Plus className="size-4 text-muted" /> Start from an empty sheet
            </span>
            <span className="mt-1 block text-[0.8125rem] leading-snug text-muted">
              Build the weekly pattern by hand, using Fill remaining whenever you want help.
            </span>
          </button>
        </div>
      </Modal>
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete timetable?"
        description="This removes the draft and all of its dated sessions."
        footer={<>
          <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => {
            if (deleting) void remove(deleting);
            setDeleting(null);
          }}>Delete</Button>
        </>}
      ><div /></Modal>
    </>
  );
}
