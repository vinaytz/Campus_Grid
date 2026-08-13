"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { api, useResource } from "@/hooks/useApi";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Table, TH, TD, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

type Row = {
  _id: string; name: string; status: string; academicYear: string; term: string;
  stats: { requested: number; placed: number; unplaced: { assignment: string; reason: string }[] };
};

export default function TimetablesPage() {
  const { push } = useToast();
  const router = useRouter();
  const { data, loading, reload } = useResource<Row[]>("/api/timetables");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const res = await api<{ id: string; stats: Row["stats"] }>("/api/timetables", {
        method: "POST",
        json: { name: name || `Draft ${new Date().toLocaleDateString()}` },
      });
      push(`Placed ${res.stats.placed} of ${res.stats.requested} sessions.`);
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
        json: { name: name || "Untitled", empty: true },
      });
      router.push(`/dashboard/timetables/${res.id}`);
    } catch (e) {
      push((e as Error).message, "error");
      setBusy(false);
    }
  }

  async function publish(id: string) {
    try {
      await api(`/api/timetables/${id}`, { method: "PATCH", json: { status: "PUBLISHED" } });
      push("Published to the public board.");
      await reload();
    } catch (e) { push((e as Error).message, "error"); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this timetable?")) return;
    await api(`/api/timetables/${id}`, { method: "DELETE" });
    push("Timetable deleted.");
    await reload();
  }

  const rows = data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Build"
        title="Timetables"
        description="Generate a draft, arrange it on the canvas, then publish one to the public board."
        action={<Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" /> New timetable
        </Button>}
      />

      {rows.length === 0 && !loading ? (
        <div className="rounded-md border border-rule bg-sheet shadow-hair">
          <EmptyState
            title="No timetables yet"
            hint="With faculty, rooms, sections and teaching load in place, generate your first draft — then fine-tune it by hand."
            action={<Button variant="primary" size="sm" onClick={() => setOpen(true)}>New timetable</Button>}
          />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <TH>Name</TH><TH>Term</TH><TH>Complete</TH><TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const req = t.stats?.requested || 0;
              const pct = req ? Math.round(((t.stats?.placed ?? 0) / req) * 100) : 0;
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
                        <div className={cn("h-full rounded-full", pct === 100 ? "bg-moss" : "bg-claret")}
                          style={{ width: `${pct}%` }} />
                      </div>
                      <span className="font-mono text-micro text-muted tnum">
                        {t.stats?.placed ?? 0}/{req}
                      </span>
                    </div>
                  </TD>
                  <TD>
                    <Badge tone={t.status === "PUBLISHED" ? "moss" : t.status === "ARCHIVED" ? "neutral" : "ochre"}>
                      {t.status}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      {t.status !== "PUBLISHED" && (
                        <Button size="xs" variant="ghost" onClick={() => publish(t._id)}>Publish</Button>
                      )}
                      <Link href={`/dashboard/timetables/${t._id}`}>
                        <Button size="xs" variant="secondary">Open canvas</Button>
                      </Link>
                      <Button size="xs" variant="ghost" className="hover:text-claret"
                        onClick={() => remove(t._id)} aria-label="Delete">
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
        description="Start from a solved draft, or from an empty sheet you fill in yourself."
        footer={<Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>}
      >
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Odd term — draft 1" />

        <div className="mt-5 space-y-2">
          <button onClick={generate} disabled={busy}
            className="w-full rounded border border-rule-strong/70 bg-sheet p-3 text-left transition-colors hover:border-claret disabled:opacity-50">
            <span className="flex items-center gap-2 text-[0.875rem] font-medium">
              <Wand2 className="size-4 text-claret" /> Solve it for me
            </span>
            <span className="mt-1 block text-[0.8125rem] leading-snug text-muted">
              Places every active assignment against your rooms, periods and rules. Takes a few seconds.
            </span>
          </button>

          <button onClick={blank} disabled={busy}
            className="w-full rounded border border-rule-strong/70 bg-sheet p-3 text-left transition-colors hover:border-graphite-400 disabled:opacity-50">
            <span className="flex items-center gap-2 text-[0.875rem] font-medium">
              <Plus className="size-4 text-muted" /> Start from an empty sheet
            </span>
            <span className="mt-1 block text-[0.8125rem] leading-snug text-muted">
              Drag sessions on yourself, and use Fill remaining whenever you want help.
            </span>
          </button>
        </div>
      </Modal>
    </>
  );
}
