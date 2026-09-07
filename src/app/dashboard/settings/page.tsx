"use client";
import { useEffect, useState } from "react";
import { api, useResource } from "@/hooks/useApi";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Toggle } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { DAY_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Weights = {
  sectionBalance: number; facultyBalance: number; afternoonBreak: number;
  subjectSpacing: number; consecutive: number; gaps: number;
  tailDistribution: number; roomFit: number;
};

type Settings = {
  institutionName: string; academicYear: string; term: string;
  workingDays: number[];
  maxHoursPerDayPerSection: number;
  maxConsecutiveHoursPerFaculty: number;
  allowSessionsAcrossBreak: boolean;
  maxSessionsPerAssignmentPerDay: number;
  preferAfternoonBreak: boolean;
  afternoonWindowStart: string;
  afternoonWindowEnd: string;
  weights?: Partial<Weights>;
};

const WEIGHT_LABELS: { key: keyof Weights; label: string; hint: string }[] = [
  { key: "sectionBalance", label: "Section load balance", hint: "even days for students" },
  { key: "facultyBalance", label: "Faculty load balance", hint: "even days for staff" },
  { key: "afternoonBreak", label: "Afternoon free period", hint: "a break in the window" },
  { key: "subjectSpacing", label: "Subject spread", hint: "don't stack a course" },
  { key: "consecutive", label: "Consecutive classes", hint: "avoid long runs" },
  { key: "gaps", label: "Idle gaps", hint: "avoid dead periods" },
  { key: "tailDistribution", label: "Tail distribution", hint: "don't dump into the last week" },
  { key: "roomFit", label: "Room suitability", hint: "prefer a right-sized room" },
];

export default function SettingsPage() {
  const { push } = useToast();
  const { data } = useResource<Settings>("/api/settings");
  const [form, setForm] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setForm(data); }, [data]);

  if (!form) return <div className="h-1 w-32 overflow-hidden rounded-full bg-ink/10"><div className="sweeping h-full w-full animate-sweep rounded-full" /></div>;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setForm((p) => (p ? { ...p, [k]: v } : p));

  const setWeight = (k: keyof Weights, v: number) =>
    setForm((p) => (p ? { ...p, weights: { ...(p.weights ?? {}), [k]: v } } : p));

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

  const weights = form.weights ?? {};

  return (
    <>
      <PageHeader
        eyebrow="Scheduling"
        title="Rules"
        description="Hard limits the generator must never break, and soft preferences it uses to choose a better timetable."
        action={<Button variant="primary" size="sm" onClick={save} loading={saving}>Save rules</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-rule bg-sheet p-4 shadow-hair">
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

        <section className="rounded-md border border-rule bg-sheet p-4 shadow-hair">
          <p className="label mb-4">Default working days</p>
          <div className="flex flex-wrap gap-1.5">
            {DAY_NAMES.map((name, i) => {
              const on = form.workingDays.includes(i);
              return (
                <button key={i} type="button" onClick={() => toggleDay(i)} aria-pressed={on}
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
            A fallback only. Once a semester exists, its own teaching weekdays and
            calendar exceptions decide which dates are usable.
          </p>
        </section>

        <section className="rounded-md border border-rule bg-sheet p-4 shadow-hair lg:col-span-2">
          <p className="label mb-1">Hard limits</p>
          <p className="mb-4 text-[0.8125rem] text-muted">
            The generator reports a timetable infeasible rather than break any of these.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
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
            <Input
              label="Max meetings per class, per day" type="number"
              hint="normally 1"
              value={form.maxSessionsPerAssignmentPerDay}
              onChange={(e) => set("maxSessionsPerAssignmentPerDay", Number(e.target.value))}
            />
            <div className="sm:col-span-3">
              <Toggle
                label="Allow long sessions to run through a break period"
                description="Off means a 2 or 3 period lab can never straddle a break. A real gap in the clock is never crossed either way."
                checked={form.allowSessionsAcrossBreak}
                onChange={(v) => set("allowSessionsAcrossBreak", v)}
              />
            </div>
          </div>
        </section>

        <section className="rounded-md border border-rule bg-sheet p-4 shadow-hair lg:col-span-2">
          <p className="label mb-1">Afternoon free period</p>
          <p className="mb-4 max-w-2xl text-[0.8125rem] leading-relaxed text-muted">
            There is no universal lunch break here. Instead the optimiser tries to
            leave <em>each section</em> at least one free period somewhere in this
            window, so 2403 might be free at 12:00 while 2405 is free at 14:00.
            It is a preference, never a blocker — it gives way when the alternative
            is a worse timetable.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Window starts" type="time" value={form.afternoonWindowStart}
              onChange={(e) => set("afternoonWindowStart", e.target.value)} />
            <Input label="Window ends" type="time" value={form.afternoonWindowEnd}
              onChange={(e) => set("afternoonWindowEnd", e.target.value)} />
            <div className="sm:col-span-3">
              <Toggle
                label="Prefer an afternoon free period per section"
                description="Turn off to let the optimiser ignore the window entirely."
                checked={form.preferAfternoonBreak}
                onChange={(v) => set("preferAfternoonBreak", v)}
              />
            </div>
          </div>
        </section>

        <section className="rounded-md border border-rule bg-sheet p-4 shadow-hair lg:col-span-2">
          <p className="label mb-1">Soft preference weights</p>
          <p className="mb-4 text-[0.8125rem] leading-relaxed text-muted">
            These weights control how strongly the generator prefers each soft objective relative to the others.
            Higher value means greater priority; 0 disables that preference. Soft penalties never make a timetable invalid.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {WEIGHT_LABELS.map((item) => (
              <Input key={item.key} label={item.label} hint={item.hint} type="number" min={0} max={5} step={0.1}
                value={weights[item.key] ?? 1}
                onChange={(e) => setWeight(item.key, Number(e.target.value))} />
            ))}
          </div>
        </section>

      </div>
    </>
  );
}
