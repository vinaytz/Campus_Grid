"use client";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Plus, Trash2, AlertTriangle, Check } from "lucide-react";
import { api, useResource } from "@/hooks/useApi";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Select, Toggle } from "@/components/ui/Field";
import { Panel, PanelHead, Stat } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { DAY_NAMES, DAY_SHORT, CALENDAR_EXCEPTION_KINDS, prettyDate } from "@/lib/constants";
import { buildTeachingDays, teachingWeekCount } from "@/lib/scheduler/calendar";
import { cn } from "@/lib/utils";

type Exception = {
  date: string;
  endDate?: string;
  kind: "HOLIDAY" | "EVENT" | "EXAM" | "SPECIAL_WORKING";
  label: string;
  followsWeekday?: number | null;
};

type Semester = {
  _id?: string;
  name: string;
  academicYear: string;
  term: string;
  startDate: string;
  endDate: string;
  teachingWeekdays: number[];
  exceptions: Exception[];
  active: boolean;
};

const BLANK: Semester = {
  name: "Odd Semester 2025",
  academicYear: "2025-26",
  term: "Odd",
  startDate: "",
  endDate: "",
  teachingWeekdays: [1, 2, 3, 4, 5],
  exceptions: [],
  active: true,
};

const TONE: Record<string, "claret" | "ochre" | "lapis" | "moss"> = {
  HOLIDAY: "claret", EXAM: "ochre", EVENT: "lapis", SPECIAL_WORKING: "moss",
};

export default function SemesterPage() {
  const { push } = useToast();
  const { data, reload } = useResource<Semester[]>("/api/admin/semesters");
  const [form, setForm] = useState<Semester | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Exception>({ date: "", kind: "HOLIDAY", label: "", followsWeekday: null });

  // Edit the active semester by default; there is usually only one that matters.
  useEffect(() => {
    if (!data) return;
    setForm((current) => current ?? (data.find((s) => s.active) ?? data[0] ?? BLANK));
  }, [data]);

  const set = <K extends keyof Semester>(k: K, v: Semester[K]) =>
    setForm((p) => (p ? { ...p, [k]: v } : p));

  /**
   * The derived calendar, computed client-side with the same function the
   * scheduler uses on the server. Seeing the real teaching-day count react to a
   * holiday is the whole point of this screen.
   */
  const derived = useMemo(() => {
    if (!form?.startDate || !form?.endDate) return null;
    try {
      const days = buildTeachingDays({
        startDate: form.startDate,
        endDate: form.endDate,
        teachingWeekdays: form.teachingWeekdays,
        exceptions: form.exceptions as any,
      });
      const perWeekday = new Map<number, number>();
      for (const d of days) perWeekday.set(d.patternWeekday, (perWeekday.get(d.patternWeekday) ?? 0) + 1);
      return { days, weeks: teachingWeekCount(days), perWeekday, error: null as string | null };
    } catch (e) {
      return { days: [], weeks: 0, perWeekday: new Map<number, number>(), error: (e as Error).message };
    }
  }, [form?.startDate, form?.endDate, form?.teachingWeekdays, form?.exceptions]);

  if (!form) {
    return <div className="h-1 w-32 overflow-hidden rounded-full bg-ink/10"><div className="sweeping h-full w-full animate-sweep rounded-full" /></div>;
  }

  const toggleWeekday = (d: number) =>
    set("teachingWeekdays", form!.teachingWeekdays.includes(d)
      ? form!.teachingWeekdays.filter((x) => x !== d)
      : [...form!.teachingWeekdays, d].sort());

  function addException() {
    if (!draft.date || !draft.label.trim()) {
      push("An exception needs a date and a label.", "error");
      return;
    }
    set("exceptions", [...form!.exceptions, { ...draft, label: draft.label.trim() }]
      .sort((a, b) => a.date.localeCompare(b.date)));
    setDraft({ date: "", kind: "HOLIDAY", label: "", followsWeekday: null });
  }

  async function save() {
    setSaving(true);
    try {
      const payload = { ...form! };
      delete (payload as any)._id;
      const saved = form!._id
        ? await api<Semester>(`/api/admin/semesters/${form!._id}`, { method: "PUT", json: payload })
        : await api<Semester>("/api/admin/semesters", { method: "POST", json: payload });
      push("Semester calendar saved.");
      setForm(saved);
      await reload();
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  const semesters = data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Scheduling"
        title="Semester & calendar"
        description="The date range, the weekdays that teach, and every holiday, event, exam block or special working day. Regular classes are only ever placed on the days this leaves usable."
        action={<Button variant="primary" size="sm" onClick={save} loading={saving}>Save calendar</Button>}
      />

      {semesters.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="label">Editing</span>
          {semesters.map((s) => (
            <button key={s._id} onClick={() => setForm(s)}
              className={cn(
                "rounded-sm border px-2.5 py-1 text-[0.78rem] transition-colors",
                s._id === form._id ? "border-claret bg-claret text-white" : "border-rule-strong/60 bg-sheet hover:border-graphite-400"
              )}>
              {s.name}
            </button>
          ))}
          <Button size="xs" variant="ghost" onClick={() => setForm({ ...BLANK })}>
            <Plus className="size-3" /> New
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section className="rounded-md border border-rule bg-sheet p-4 shadow-hair">
          <p className="label mb-4">The term</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input label="Name" value={form.name} onChange={(e) => set("name", e.target.value)}
                placeholder="Odd Semester 2025" />
            </div>
            <Input label="Academic year" value={form.academicYear}
              onChange={(e) => set("academicYear", e.target.value)} placeholder="2025-26" />
            <Input label="Term" value={form.term}
              onChange={(e) => set("term", e.target.value)} placeholder="Odd" />
            <Input label="First day of teaching" type="date" value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)} />
            <Input label="Last day of teaching" type="date" value={form.endDate}
              onChange={(e) => set("endDate", e.target.value)} />
          </div>

          <p className="label mb-2 mt-5">Teaching weekdays</p>
          <div className="flex flex-wrap gap-1.5">
            {DAY_NAMES.map((name, i) => {
              const on = form.teachingWeekdays.includes(i);
              const count = derived?.perWeekday.get(i) ?? 0;
              return (
                <button key={i} type="button" onClick={() => toggleWeekday(i)} aria-pressed={on}
                  className={cn(
                    "rounded border px-2.5 py-1.5 text-center text-[0.78rem] font-medium transition-colors",
                    on ? "border-graphite-900 bg-graphite-900 text-white" : "border-rule-strong/70 text-muted hover:border-graphite-400"
                  )}>
                  <span className="block">{name.slice(0, 3)}</span>
                  <span className={cn("block font-mono text-[0.6rem] tnum", on ? "text-white/60" : "text-muted/70")}>
                    {count || "—"}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-micro text-muted">
            The small number is how many of that weekday actually survive once
            holidays and exam blocks are applied. A special working day is counted
            under the weekday it follows.
          </p>

          <div className="rule-t mt-4 pt-3">
            <Toggle
              label="This is the semester to generate against"
              description="Generation uses the most recently updated active semester."
              checked={form.active}
              onChange={(v) => set("active", v)}
            />
          </div>
        </section>

        <section className="rounded-md border border-rule bg-sheet p-4 shadow-hair">
          <PanelHead title="Derived calendar" />
          {derived?.error ? (
            <p className="flex items-start gap-1.5 rounded border border-claret-line bg-claret-soft px-3 py-2 text-[0.8125rem] text-claret">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {derived.error}
            </p>
          ) : !derived || !form.startDate || !form.endDate ? (
            <p className="text-[0.8125rem] text-muted">
              Set a start and end date to see how many teaching days the term actually has.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
                <Stat label="Teaching days" value={derived.days.length} sub="regular classes may be placed" />
                <Stat label="Teaching weeks" value={derived.weeks} sub="calendar weeks touched" />
                <Stat label="Days removed" value={form.exceptions.filter((e) => e.kind !== "SPECIAL_WORKING").length}
                  sub="holidays, events, exams" />
              </div>
              {derived.days.length === 0 && (
                <p className="mt-3 flex items-start gap-1.5 rounded border border-ochre-line bg-ochre-soft/60 px-3 py-2 text-[0.8125rem] text-ochre">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  This calendar has no usable teaching days, so nothing can be generated against it.
                </p>
              )}
              {derived.days.length > 0 && (
                <p className="rule-t mt-4 pt-3 font-mono text-micro text-muted">
                  {prettyDate(derived.days[0].date)} → {prettyDate(derived.days[derived.days.length - 1].date)}
                </p>
              )}
            </>
          )}
        </section>
      </div>

      <section className="mt-4 rounded-md border border-rule bg-sheet shadow-hair">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
          <span className="label flex items-center gap-1.5">
            <CalendarDays className="size-3.5" /> Calendar exceptions
          </span>
          <span className="font-mono text-micro text-muted tnum">{form.exceptions.length}</span>
        </div>

        <div className="grid gap-3 border-b border-rule bg-ground/40 p-4 sm:grid-cols-[auto_auto_1fr_auto_auto] sm:items-end">
          <Input label="Date" type="date" value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          <Input label="Until (optional)" type="date" value={draft.endDate ?? ""}
            onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
          <Select label="Kind" value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value as Exception["kind"] })}>
            {CALENDAR_EXCEPTION_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </Select>
          {draft.kind === "SPECIAL_WORKING" ? (
            <Select label="Runs as" value={String(draft.followsWeekday ?? "")}
              onChange={(e) => setDraft({ ...draft, followsWeekday: e.target.value === "" ? null : Number(e.target.value) })}>
              <option value="">its own weekday</option>
              {DAY_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
            </Select>
          ) : <div className="hidden sm:block" />}
          <div className="sm:col-span-1">
            <Input label="Label" value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="Independence Day" />
          </div>
          <div className="sm:col-span-5">
            <Button size="sm" variant="secondary" onClick={addException}>
              <Plus className="size-3.5" /> Add exception
            </Button>
          </div>
        </div>

        {form.exceptions.length === 0 ? (
          <p className="px-4 py-6 text-center text-[0.8125rem] text-muted">
            No exceptions yet. Every selected weekday in the range counts as a teaching day.
          </p>
        ) : (
          <ul className="divide-y divide-rule/70">
            {form.exceptions.map((ex, i) => (
              <li key={`${ex.date}-${i}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <Badge tone={TONE[ex.kind]}>
                  {ex.kind === "SPECIAL_WORKING" ? <Check className="size-2.5" /> : null}
                  {CALENDAR_EXCEPTION_KINDS.find((k) => k.value === ex.kind)?.label ?? ex.kind}
                </Badge>
                <span className="font-mono text-micro tnum">
                  {prettyDate(ex.date)}{ex.endDate && ex.endDate !== ex.date ? ` → ${prettyDate(ex.endDate)}` : ""}
                </span>
                <span className="min-w-0 flex-1 truncate text-[0.8125rem]">{ex.label}</span>
                {ex.kind === "SPECIAL_WORKING" && ex.followsWeekday !== null && ex.followsWeekday !== undefined && (
                  <span className="font-mono text-[0.68rem] text-muted">
                    runs as {DAY_SHORT[ex.followsWeekday]}
                  </span>
                )}
                <Button size="xs" variant="ghost" className="hover:text-claret"
                  aria-label="Remove exception"
                  onClick={() => set("exceptions", form.exceptions.filter((_, n) => n !== i))}>
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
