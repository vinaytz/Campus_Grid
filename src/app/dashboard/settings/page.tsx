"use client";
import { useEffect, useState } from "react";
import { api, useResource } from "@/hooks/useApi";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Toggle } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { DAY_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Settings = {
  institutionName: string; academicYear: string; term: string;
  workingDays: number[]; maxHoursPerDayPerSection: number;
  maxConsecutiveHoursPerFaculty: number; allowSessionsAcrossBreak: boolean;
};

export default function SettingsPage() {
  const { push } = useToast();
  const { data } = useResource<Settings>("/api/settings");
  const [form, setForm] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setForm(data); }, [data]);

  if (!form) return <div className="h-1 w-32 overflow-hidden rounded-full bg-ink/10"><div className="sweeping h-full w-full animate-sweep rounded-full" /></div>;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setForm((p) => (p ? { ...p, [k]: v } : p));

  const toggleDay = (d: number) =>
    set("workingDays", form.workingDays.includes(d)
      ? form.workingDays.filter((x) => x !== d)
      : [...form.workingDays, d].sort());

  async function save() {
    setSaving(true);
    try {
      await api("/api/settings", { method: "PUT", json: form });
      push("Rules saved.");
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Scheduling"
        title="Rules"
        description="Institution-wide constraints the generator must respect."
        action={<Button variant="primary" size="sm" onClick={save} loading={saving}>Save rules</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-rule bg-sheet shadow-hair p-4">
          <p className="label mb-4">Institution</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input label="Institution name" value={form.institutionName}
                onChange={(e) => set("institutionName", e.target.value)} />
            </div>
            <Input label="Academic year" value={form.academicYear}
              onChange={(e) => set("academicYear", e.target.value)} placeholder="2025-26" />
            <Input label="Term" value={form.term}
              onChange={(e) => set("term", e.target.value)} placeholder="Odd" />
          </div>
        </section>

        <section className="rounded-md border border-rule bg-sheet shadow-hair p-4">
          <p className="label mb-4">Working days</p>
          <div className="flex flex-wrap gap-1.5">
            {DAY_NAMES.map((name, i) => {
              const on = form.workingDays.includes(i);
              return (
                <button key={i} type="button" onClick={() => toggleDay(i)}
                  aria-pressed={on}
                  className={cn(
                    "rounded border px-3 py-2 text-[0.8125rem] font-medium transition-colors",
                    on ? "border-graphite-900 bg-graphite-900 text-white" : "border-rule-strong/70 text-muted hover:border-graphite-400"
                  )}>
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-micro text-muted">
            Classes are only ever placed on the days selected here.
          </p>
        </section>

        <section className="rounded-md border border-rule bg-sheet shadow-hair p-4 lg:col-span-2">
          <p className="label mb-4">Load limits</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Max periods per day, per section" type="number"
              hint="prevents 9-hour student days"
              value={form.maxHoursPerDayPerSection}
              onChange={(e) => set("maxHoursPerDayPerSection", Number(e.target.value))}
            />
            <Input
              label="Max consecutive periods, per faculty" type="number"
              hint="forces a gap after a long run"
              value={form.maxConsecutiveHoursPerFaculty}
              onChange={(e) => set("maxConsecutiveHoursPerFaculty", Number(e.target.value))}
            />
            <div className="sm:col-span-2">
              <Toggle
                label="Allow long sessions to run through a break"
                description="Off means a 2 or 3 period lab can never straddle lunch."
                checked={form.allowSessionsAcrossBreak}
                onChange={(v) => set("allowSessionsAcrossBreak", v)}
              />
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
