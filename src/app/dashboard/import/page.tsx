"use client";
import { useRef, useState } from "react";
import { Upload, Download, AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { api } from "@/hooks/useApi";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { Table, TH, TD } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

type Resource = "rooms" | "faculty" | "subjects" | "sections" | "assignments";

type Preview = {
  resource: Resource;
  headers: string[];
  unknownHeaders: string[];
  rows: Record<string, unknown>[];
  display: Record<string, string>[];
  issues: { row: number; field?: string; message: string }[];
  created: number;
  updated: number;
  ok: boolean;
};

const RESOURCES: { value: Resource; label: string; hint: string }[] = [
  { value: "rooms", label: "Rooms", hint: "block, number, capacity, type, capabilities" },
  { value: "faculty", label: "Faculty", hint: "ID, name, department, daily cap" },
  { value: "subjects", label: "Subjects", hint: "code, name, type, default length" },
  { value: "sections", label: "Sections", hint: "number, program, semester, strength" },
  { value: "assignments", label: "Teaching Assignment", hint: "section, subject, faculty, required sessions" },
];

/**
 * Bulk import: upload → parse → validate → preview → confirm → commit.
 *
 * Nothing reaches the database until the admin presses Import, and a batch is
 * all-or-nothing — a file with any invalid row imports nothing at all, so a
 * half-loaded spreadsheet can never leave the data in a confusing state.
 */
export default function ImportPage() {
  const { push } = useToast();
  const [resource, setResource] = useState<Resource>("rooms");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setPreview(null);
    setFileName(file.name);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/import?resource=${resource}`, { method: "POST", body: form });
      const payload = await res.json();
      if (!res.ok || payload.ok === false) throw new Error(payload.error ?? "That file could not be read.");
      setPreview(payload.data as Preview);
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await api<{ created: number; updated: number }>("/api/import", {
        method: "PUT",
        json: { resource: preview.resource, rows: preview.rows },
      });
      push(`Imported ${res.created} new and updated ${res.updated} existing record(s).`);
      setPreview(null);
      setFileName("");
      if (fileInput.current) fileInput.current.value = "";
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const columns = preview?.display?.[0] ? Object.keys(preview.display[0]) : [];

  return (
    <>
      <PageHeader
        eyebrow="Master data"
        title="Bulk import"
        description="Load rooms, faculty, subjects, sections or Teaching Assignment from a spreadsheet. Everything is checked and shown to you before anything is written."
        action={
          <a href={`/api/import?resource=${resource}`} download>
            <Button variant="secondary" size="sm">
              <Download className="size-3.5" /> Template CSV
            </Button>
          </a>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <section className="rounded-md border border-rule bg-sheet p-4 shadow-hair">
          <p className="label mb-3">What are you importing?</p>
          <div className="space-y-1">
            {RESOURCES.map((r) => (
              <button
                key={r.value}
                onClick={() => { setResource(r.value); setPreview(null); setFileName(""); }}
                className={cn(
                  "w-full rounded border p-2.5 text-left transition-colors",
                  resource === r.value
                    ? "border-claret bg-claret-soft/50"
                    : "border-rule-strong/60 hover:border-graphite-400"
                )}
              >
                <span className="block text-[0.8125rem] font-medium">{r.label}</span>
                <span className="mt-0.5 block font-mono text-[0.62rem] leading-snug text-muted">{r.hint}</span>
              </button>
            ))}
          </div>
          <p className="rule-t mt-4 pt-3 text-micro leading-relaxed text-muted">
            Headers are matched loosely — &quot;Room No&quot;, &quot;room_number&quot; and
            &quot;code&quot; all work. Teaching Assignment refers to sections, subjects, faculty
            and rooms by their own codes, not database ids.
          </p>
        </section>

        <div className="min-w-0">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void upload(file);
            }}
            className={cn(
              "rounded-md border-2 border-dashed bg-sheet px-6 py-10 text-center transition-colors",
              dragOver ? "border-claret bg-claret-soft/30" : "border-rule-strong"
            )}
          >
            <FileSpreadsheet className="mx-auto mb-3 size-6 text-muted" />
            <p className="text-[0.875rem] font-medium">
              {fileName || "Drop a CSV here"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[0.8125rem] text-muted">
              Or choose a file. Up to 2 MB. Export from Excel or Sheets as CSV.
            </p>
            <input
              ref={fileInput} type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
            />
            <Button variant="secondary" size="sm" className="mt-3"
              onClick={() => fileInput.current?.click()} loading={busy}>
              <Upload className="size-3.5" /> Choose file
            </Button>
          </div>

          {preview && (
            <section className="mt-4 overflow-hidden rounded-md border border-rule bg-sheet shadow-hair">
              <div className={cn(
                "flex flex-wrap items-center gap-3 border-b px-4 py-3",
                preview.ok ? "border-moss-line bg-moss-soft/50" : "border-claret-line bg-claret-soft/50"
              )}>
                {preview.ok
                  ? <CheckCircle2 className="size-4 shrink-0 text-moss" />
                  : <AlertTriangle className="size-4 shrink-0 text-claret" />}
                <p className={cn("text-[0.875rem] font-medium", preview.ok ? "text-moss" : "text-claret")}>
                  {preview.ok
                    ? `Ready — ${preview.created} new, ${preview.updated} to update.`
                    : `${preview.issues.length} problem${preview.issues.length === 1 ? "" : "s"} found. Nothing will be imported until they are fixed.`}
                </p>
                {preview.ok && (
                  <Button size="sm" className="ml-auto" onClick={commit} loading={busy}>
                    Import {preview.rows.length} row{preview.rows.length === 1 ? "" : "s"}
                  </Button>
                )}
              </div>

              {preview.unknownHeaders.length > 0 && (
                <p className="border-b border-rule bg-ochre-soft/40 px-4 py-2 text-[0.8125rem] text-ochre">
                  Ignored unrecognised column{preview.unknownHeaders.length === 1 ? "" : "s"}:{" "}
                  <span className="font-mono">{preview.unknownHeaders.join(", ")}</span>
                </p>
              )}

              {preview.issues.length > 0 && (
                <div className="thin-scroll max-h-56 overflow-y-auto border-b border-rule">
                  <ul className="divide-y divide-rule/60">
                    {preview.issues.slice(0, 40).map((issue, i) => (
                      <li key={i} className="flex items-baseline gap-3 px-4 py-1.5 text-[0.8125rem]">
                        <span className="w-14 shrink-0 font-mono text-micro text-muted tnum">
                          {issue.row > 0 ? `row ${issue.row}` : "file"}
                        </span>
                        {issue.field && (
                          <span className="shrink-0 font-mono text-[0.68rem] font-semibold">{issue.field}</span>
                        )}
                        <span className="text-claret">{issue.message}</span>
                      </li>
                    ))}
                  </ul>
                  {preview.issues.length > 40 && (
                    <p className="px-4 py-2 font-mono text-micro text-muted">
                      +{preview.issues.length - 40} more
                    </p>
                  )}
                </div>
              )}

              {preview.display.length > 0 && (
                <>
                  <p className="px-4 py-2 label">
                    Preview · first {Math.min(20, preview.display.length)} of {preview.display.length} valid row(s)
                  </p>
                  <div className="thin-scroll max-h-80 overflow-auto">
                    <Table>
                      <thead>
                        <tr>{columns.map((c) => <TH key={c}>{c}</TH>)}</tr>
                      </thead>
                      <tbody>
                        {preview.display.slice(0, 20).map((row, i) => (
                          <tr key={i}>
                            {columns.map((c) => (
                              <TD key={c} className="font-mono text-micro">{row[c] ?? "—"}</TD>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
