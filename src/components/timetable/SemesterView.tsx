"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, Plus, Trash2, Pin, CalendarPlus } from "lucide-react";
import { api } from "@/hooks/useApi";
import { Button } from "@/components/ui/Button";
import { Select, Segmented, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { DAY_SHORT, prettyDate } from "@/lib/constants";
import { prettyTime, cn } from "@/lib/utils";

export type TeachingDay = { date: string; weekday: number; patternWeekday: number; week: number };
export type Slot = { order: number; label: string; start: string; end: string; kind: "CLASS" | "BREAK" };

export type Session = {
  _id: string;
  assignment?: string;
  date: string;
  day: number;
  slotOrder: number;
  duration: number;
  kind: string;
  type: "REGULAR" | "EXTRA";
  locked?: boolean;
  reason?: string;
  section?: { _id: string; number: string; strength?: number };
  subject?: { _id: string; code: string; name: string };
  faculty?: { _id: string; name: string };
  room?: { _id: string; block: string; code: string };
};

type Lens = "section" | "faculty" | "room";

const BAR: Record<string, string> = { LECTURE: "bg-accent", LAB: "bg-accent/70", TUTORIAL: "bg-accent/40" };

function EditSessionModal({
  open, session, teachingDays, slots, rooms, onClose, onSave, saving,
}: {
  open: boolean;
  session: Session | null;
  teachingDays: TeachingDay[];
  slots: Slot[];
  rooms: { _id: string; block: string; code: string; capacity: number; type: string }[];
  onClose: () => void;
  onSave: (date: string, slotOrder: number, room: string) => Promise<void>;
  saving: boolean;
}) {
  const [date, setDate] = useState("");
  const [slotOrder, setSlotOrder] = useState("");
  const [room, setRoom] = useState("");

  useEffect(() => {
    if (session) {
      setDate(session.date);
      setSlotOrder(String(session.slotOrder));
      setRoom(session.room?._id ?? "");
    }
  }, [session]);

  return (
    <Modal open={open} onClose={onClose}
      title={session?.type === "EXTRA" ? "Edit extra class" : "Edit regular class"}
      description="The server rechecks clashes, rooms, calendar rules and faculty availability before saving."
      footer={<><Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={() => void onSave(date, Number(slotOrder), room)} loading={saving}
          disabled={!date || !slotOrder || !room}>Save change</Button></>}>
      <div className="space-y-3">
        <Select label="Date" value={date} onChange={(e) => setDate(e.target.value)}>
          {teachingDays.map((d) => <option key={d.date} value={d.date}>{d.date}</option>)}
        </Select>
        <Select label="Start period" value={slotOrder} onChange={(e) => setSlotOrder(e.target.value)}>
          {slots.filter((s) => s.kind === "CLASS").map((s) =>
            <option key={s.order} value={s.order}>{s.label} ({s.start}-{s.end})</option>)}
        </Select>
        <Select label="Room" value={room} onChange={(e) => setRoom(e.target.value)}>
          {rooms.map((r) => <option key={r._id} value={r._id}>{r.block}-{r.code}</option>)}
        </Select>
      </div>
    </Modal>
  );
}

function RegularClassModal({
  open, onClose, timetableId, assignments, teachingDays, slots, rooms, onAdded,
}: {
  open: boolean;
  onClose: () => void;
  timetableId: string;
  assignments: { _id: string; section: { number: string }; subject: { code: string }; faculty: { name: string }; duration: number; kind: string }[];
  teachingDays: TeachingDay[];
  slots: Slot[];
  rooms: { _id: string; block: string; code: string; capacity: number; type: string }[];
  onAdded: () => Promise<void>;
}) {
  const { push } = useToast();
  const [assignment, setAssignment] = useState("");
  const [date, setDate] = useState("");
  const [slotOrder, setSlotOrder] = useState("");
  const [room, setRoom] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await api(`/api/timetables/${timetableId}/sessions`, {
        method: "POST",
        json: { type: "REGULAR", assignment, date, slotOrder: Number(slotOrder), room },
      });
      push("Regular class added.");
      await onAdded();
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add regular class"
      description="Choose an existing teaching assignment. Its configured duration and hard constraints are enforced by the server."
      footer={<><Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={() => void submit()} loading={saving}
          disabled={!assignment || !date || !slotOrder || !room}>Add class</Button></>}>
      <div className="space-y-3">
        <Select label="Teaching assignment" value={assignment} onChange={(e) => setAssignment(e.target.value)}>
          <option value="">Choose an assignment</option>
          {assignments.map((a) => <option key={a._id} value={a._id}>
            {a.subject?.code} · Section {a.section?.number} · {a.faculty?.name} · {a.duration}h
          </option>)}
        </Select>
        <Select label="Date" value={date} onChange={(e) => setDate(e.target.value)}>
          <option value="">Choose a teaching day</option>
          {teachingDays.map((d) => <option key={d.date} value={d.date}>{d.date}</option>)}
        </Select>
        <Select label="Start period" value={slotOrder} onChange={(e) => setSlotOrder(e.target.value)}>
          <option value="">Choose a period</option>
          {slots.filter((s) => s.kind === "CLASS").map((s) =>
            <option key={s.order} value={s.order}>{s.label} ({s.start}-{s.end})</option>)}
        </Select>
        <Select label="Room" value={room} onChange={(e) => setRoom(e.target.value)}>
          <option value="">Choose a room</option>
          {rooms.map((r) => <option key={r._id} value={r._id}>{r.block}-{r.code}</option>)}
        </Select>
      </div>
    </Modal>
  );
}

/**
 * The dated semester view: the actual classes, week by week.
 *
 * This edits the real dated timetable. Every
 * move here is validated server-side against the semester calendar and every
 * hard constraint before it is written, and a rejected move leaves the timetable
 * untouched.
 */
export function SemesterView({
  timetableId, sessions, slots, teachingDays, rooms, assignments, readOnly, onChanged,
}: {
  timetableId: string;
  sessions: Session[];
  slots: Slot[];
  teachingDays: TeachingDay[];
  rooms: { _id: string; block: string; code: string; capacity: number; type: string }[];
  assignments: { _id: string; section: { number: string }; subject: { code: string }; faculty: { name: string }; duration: number; kind: string }[];
  readOnly?: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const { push } = useToast();
  const [lens, setLens] = useState<Lens>("section");
  const [focus, setFocus] = useState("");
  const [week, setWeek] = useState(1);
  const [busy, setBusy] = useState(false);
  const [addingExtra, setAddingExtra] = useState(false);
  const [addingRegular, setAddingRegular] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Session | null>(null);
  const [editing, setEditing] = useState<Session | null>(null);
  const [dragging, setDragging] = useState<Session | null>(null);
  const [localSessions, setLocalSessions] = useState(sessions);
  const [pendingMoveId, setPendingMoveId] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingMoveId) setLocalSessions(sessions);
  }, [sessions, pendingMoveId]);

  const weeks = useMemo(() => {
    const set = new Set(teachingDays.map((d) => d.week));
    return [...set].sort((a, b) => a - b);
  }, [teachingDays]);

  const ordered = useMemo(() => [...slots].sort((a, b) => a.order - b.order), [slots]);

  const lensOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of localSessions) {
      if (lens === "section" && s.section) m.set(s.section._id, `Section ${s.section.number}`);
      if (lens === "faculty" && s.faculty) m.set(s.faculty._id, s.faculty.name);
      if (lens === "room" && s.room) m.set(s.room._id, `${s.room.block}-${s.room.code}`);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [localSessions, lens]);

  const daysThisWeek = useMemo(
    () => teachingDays.filter((d) => d.week === week),
    [teachingDays, week]
  );

  const visible = useMemo(() => {
    const dates = new Set(daysThisWeek.map((d) => d.date));
    return localSessions.filter((s) => {
      if (!dates.has(s.date)) return false;
      if (!focus) return true;
      const owner = lens === "section" ? s.section?._id : lens === "faculty" ? s.faculty?._id : s.room?._id;
      return owner === focus;
    });
  }, [localSessions, daysThisWeek, focus, lens]);

  /** date:slotOrder → session, plus the cells a multi-period session covers. */
  const { grid, covered } = useMemo(() => {
    const grid = new Map<string, Session>();
    const covered = new Set<string>();
    for (const s of visible) {
      grid.set(`${s.date}:${s.slotOrder}`, s);
      for (let i = 1; i < s.duration; i++) covered.add(`${s.date}:${s.slotOrder + i}`);
    }
    return { grid, covered };
  }, [visible]);

  const counts = useMemo(() => {
    const regular = localSessions.filter((s) => s.type === "REGULAR").length;
    return { regular, extra: localSessions.length - regular };
  }, [localSessions]);

  async function removeSession(id: string) {
    setBusy(true);
    try {
      await api(`/api/timetables/${timetableId}/sessions`, { method: "DELETE", json: { sessionId: id } });
      push("Class removed.");
      setPendingDelete(null);
      await onChanged();
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setBusy(false);
    }

  }

  async function moveSession(session: Session, date: string, slotOrder: number, room?: string) {
    if (session.date === date && session.slotOrder === slotOrder && (!room || room === session.room?._id)) {
      setDragging(null);
      return;
    }
    const previous = localSessions;
    const targetDay = teachingDays.find((day) => day.date === date)?.weekday ?? session.day;
    const targetRoom = room ? rooms.find((candidate) => candidate._id === room) : session.room;
    setLocalSessions((current) => current.map((candidate) =>
      candidate._id === session._id
        ? { ...candidate, date, day: targetDay, slotOrder, room: targetRoom }
        : candidate
    ));
    setPendingMoveId(session._id);
    setDragging(null);
    setBusy(true);
    try {
      await api(`/api/timetables/${timetableId}/sessions`, {
        method: "PATCH", json: { sessionId: session._id, date, slotOrder, room },
      });
      push("Class moved.");
      setEditing(null);
      await onChanged();
    } catch (e) {
      setLocalSessions(previous);
      const err = e as Error & { extra?: { reasons?: string[] } };
      push(err.extra?.reasons?.join(" ") ?? err.message, "error");
    } finally {
      setBusy(false);
      setPendingMoveId(null);
    }
  }

  return (
    <>
      <div className="relative mb-4 rounded-lg border border-line bg-surface p-3 sm:p-4">
      {busy && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden rounded-t-lg bg-line"
          role="status" aria-label="Saving timetable change">
          <div className="timetable-sync-bar h-full w-1/3 bg-accent" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        <Segmented<Lens>
          value={lens}
          onChange={(v) => { setLens(v); setFocus(""); }}
          options={[
            { value: "section", label: "Section" },
            { value: "faculty", label: "Faculty" },
            { value: "room", label: "Room" },
          ]}
        />
        <div className="w-44">
          <Select value={focus} onChange={(e) => setFocus(e.target.value)} aria-label="Focus">
            <option value="">Select one {lens}</option>
            {lensOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>

        <div className="mx-0.5 hidden h-5 w-px bg-rule-strong/70 sm:block" />

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" aria-label="Previous week"
            disabled={week <= weeks[0]} onClick={() => setWeek((w) => Math.max(weeks[0], w - 1))}>
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="min-w-[7.5rem] text-center font-mono text-micro font-semibold uppercase tracking-[0.08em] tnum">
            Week {week} of {weeks.length}
          </span>
          <Button variant="ghost" size="sm" aria-label="Next week"
            disabled={week >= weeks[weeks.length - 1]}
            onClick={() => setWeek((w) => Math.min(weeks[weeks.length - 1], w + 1))}>
            <ChevronRight className="size-3.5" />
          </Button>
        </div>

        <div className="ml-auto flex w-full items-center justify-between gap-2 border-t border-line/70 pt-2.5 sm:w-auto sm:border-t-0 sm:pt-0">
          <span className="font-mono text-micro text-muted tnum">
            {counts.regular} regular{counts.extra > 0 ? ` · ${counts.extra} extra` : ""}
          </span>
          {busy && (
            <span className="inline-flex items-center gap-1.5 text-micro text-muted" role="status">
              <span className="size-3 animate-spin rounded-full border border-muted/30 border-t-accent" />
              Saving
            </span>
          )}
          {!readOnly && (
            <>
              <Button size="sm" variant="secondary" onClick={() => setAddingRegular(true)}>
                <Plus className="size-3.5" /> Add regular class
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setAddingExtra(true)}>
                <CalendarPlus className="size-3.5" /> Extra class
              </Button>
            </>
          )}
        </div>
      </div>
      </div>

      {daysThisWeek.length === 0 ? (
        <div className="rounded-md border border-dashed border-rule-strong bg-sheet px-6 py-12 text-center">
          <p className="text-[0.875rem]">No teaching days in this week</p>
          <p className="mt-1 text-[0.8125rem] text-muted">
            A holiday or exam block covers it. Use the arrows to move to another week.
          </p>
        </div>
      ) : (
        <div className="thin-scroll overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[48rem] border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 w-[86px] border-b border-r border-rule bg-ground/90 px-3 py-3 text-left">
                  <span className="eyebrow">Time</span>
                </th>
                {daysThisWeek.map((d) => (
                  <th key={d.date} className="border-b border-r border-rule bg-ground/70 px-3 py-3 text-left last:border-r-0">
                    <span className="block text-[0.8125rem] font-semibold tracking-[-0.01em]">
                      {DAY_SHORT[d.weekday].charAt(0)}{DAY_SHORT[d.weekday].slice(1).toLowerCase()}
                    </span>
                    <span className="block font-mono text-[0.62rem] text-muted tnum">{prettyDate(d.date).replace(/^\S+\s/, "")}</span>
                    {d.patternWeekday !== d.weekday && (
                      <span className="mt-0.5 block font-mono text-[0.58rem] text-moss">
                        runs as {DAY_SHORT[d.patternWeekday]}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="sheet-grid">
              {ordered.map((slot) => (
                <tr key={slot.order}>
                  <th scope="row" className="sticky left-0 z-10 border-b border-r border-rule bg-white px-3 py-2 text-left align-top">
                    <span className="block font-mono text-[0.68rem] font-medium leading-tight tnum">{prettyTime(slot.start)}</span>
                    <span className="block font-mono text-[0.62rem] leading-tight text-muted tnum">{prettyTime(slot.end)}</span>
                  </th>

                  {slot.kind === "BREAK" ? (
                    <td colSpan={daysThisWeek.length} className="border-b border-rule bg-ground/70 px-3 py-2 text-center">
                      <span className="label text-muted/80">{slot.label}</span>
                    </td>
                  ) : (
                    daysThisWeek.map((d) => {
                      const key = `${d.date}:${slot.order}`;
                      if (covered.has(key)) return null;
                      const s = grid.get(key);

                      if (!s) {
                        return (
                          <td key={key}
                            onDragOver={(e) => { if (dragging) e.preventDefault(); }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (dragging) void moveSession(dragging, d.date, slot.order, dragging.room?._id);
                            }}
                            className="h-16 border-b border-r border-rule/70 bg-white/35 last:border-r-0" />
                        );
                      }

                      return (
                        <td key={key} rowSpan={s.duration}
                          className="border-b border-r border-rule/70 p-[3px] align-top last:border-r-0">
                          <div
                            draggable={!readOnly}
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", s._id);
                              setDragging(s);
                            }}
                            onDragEnd={() => setDragging(null)}
                            onDragOver={(e) => { if (dragging) e.preventDefault(); }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (dragging && dragging._id !== s._id) {
                                void moveSession(dragging, s.date, s.slotOrder, dragging.room?._id);
                              }
                            }}
                            onClick={() => !readOnly && setEditing(s)}
                            className={cn(
                            "group relative flex h-full min-h-[4.25rem] flex-col overflow-hidden rounded-md border bg-white px-2.5 py-2 shadow-[0_3px_9px_-7px_rgba(29,43,68,.7)] transition-all hover:-translate-y-px hover:border-lapis/40 hover:shadow-sheet",
                            s.type === "EXTRA" ? "border-dashed border-ochre" : "border-rule-strong/60"
                          )}>
                            <span className={cn("absolute inset-y-0 left-0 w-[3px]", BAR[s.kind] ?? BAR.LECTURE)} />
                            <span className="flex items-center gap-1 font-mono text-[0.7rem] font-semibold leading-tight">
                              {s.subject?.code}
                              {s.locked && <Pin className="size-2.5 text-muted" />}
                              {s.type === "EXTRA" && <span className="font-sans text-[0.55rem] uppercase text-ochre">extra</span>}
                            </span>
                            <span className="truncate text-[0.7rem] leading-tight text-muted">
                              {lens === "faculty" ? s.section ? `§${s.section.number}` : "" : s.faculty?.name}
                            </span>
                            <span className="mt-auto flex flex-wrap items-center gap-x-1.5 pt-0.5 text-[0.65rem] leading-tight text-muted">
                              {lens !== "room" && s.room && (
                                <span className="font-mono text-graphite-500">{s.room.block}-{s.room.code}</span>
                              )}
                              {lens !== "section" && s.section && (
                                <span className="font-mono text-graphite-500">§{s.section.number}</span>
                              )}
                            </span>
                            {!readOnly && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setPendingDelete(s); }} disabled={busy || pendingMoveId === s._id}
                                aria-label="Remove this class"
                                className="absolute right-0.5 top-0.5 rounded-xs p-0.5 text-muted opacity-0 transition-opacity hover:text-accent group-hover:opacity-100">
                                <Trash2 className="size-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-2 px-1 text-micro text-muted">
        These are the real dated classes. Dashed borders are ad-hoc extra classes,
        which never count towards an assignment&apos;s required session total.
        A pin marks a session placed or moved by hand.
      </p>

      <ExtraClassModal
        open={addingExtra}
        onClose={() => setAddingExtra(false)}
        timetableId={timetableId}
        slots={ordered}
        rooms={rooms}
        sessions={localSessions}
        onAdded={async () => { setAddingExtra(false); await onChanged(); }}
      />
      <RegularClassModal
        open={addingRegular}
        onClose={() => setAddingRegular(false)}
        timetableId={timetableId}
        assignments={assignments}
        teachingDays={teachingDays}
        slots={ordered}
        rooms={rooms}
        onAdded={async () => { setAddingRegular(false); await onChanged(); }}
      />
      <Modal open={!!pendingDelete} onClose={() => setPendingDelete(null)}
        title={pendingDelete?.type === "REGULAR" ? "Remove regular class?" : "Remove extra class?"}
        description={pendingDelete?.type === "REGULAR"
          ? "This reduces the assignment's regular-session count and blocks publishing until the timetable is repaired and revalidated."
          : "This removes only the one-off extra class; regular session counts are unchanged."}
        footer={<><Button variant="ghost" onClick={() => setPendingDelete(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => pendingDelete && void removeSession(pendingDelete._id)}>Remove class</Button></>}>
        {pendingDelete && <div className="space-y-1 text-sm">
          <p className="font-mono">{pendingDelete.subject?.code}</p>
          <p>Section {pendingDelete.section?.number}</p>
          <p>{pendingDelete.date} · period {pendingDelete.slotOrder}</p>
        </div>}
      </Modal>
      <EditSessionModal
        open={!!editing}
        session={editing}
        teachingDays={teachingDays}
        slots={ordered}
        rooms={rooms}
        onClose={() => setEditing(null)}
        onSave={(date, slot, room) => editing ? moveSession(editing, date, slot, room) : Promise.resolve()}
        saving={busy}
      />
    </>
  );
}

/**
 * Ad-hoc extra class. Kept deliberately separate from the generator: it is a
 * schedule exception, checked against the same hard constraints but excluded
 * from every session count.
 */
function ExtraClassModal({
  open, onClose, timetableId, slots, rooms, sessions, onAdded,
}: {
  open: boolean;
  onClose: () => void;
  timetableId: string;
  slots: Slot[];
  rooms: { _id: string; block: string; code: string; capacity: number; type: string }[];
  sessions: Session[];
  onAdded: () => Promise<void>;
}) {
  const { push } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string[] | null>(null);
  const [form, setForm] = useState({
    date: "", slotOrder: "", duration: "1",
    section: "", subject: "", faculty: "", room: "",
    kind: "LECTURE", reason: "",
  });

  // The directory is derived from what is already on the timetable, so the
  // pickers only ever offer sections, subjects and staff that are in play.
  const directory = useMemo(() => {
    const sections = new Map<string, string>();
    const subjects = new Map<string, string>();
    const faculty = new Map<string, string>();
    for (const s of sessions) {
      if (s.section) sections.set(s.section._id, `${s.section.number}`);
      if (s.subject) subjects.set(s.subject._id, `${s.subject.code} — ${s.subject.name}`);
      if (s.faculty) faculty.set(s.faculty._id, s.faculty.name);
    }
    return {
      sections: [...sections.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      subjects: [...subjects.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      faculty: [...faculty.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    };
  }, [sessions]);

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/timetables/${timetableId}/sessions`, {
        method: "POST",
        json: {
          ...form,
          slotOrder: Number(form.slotOrder),
          duration: Number(form.duration),
        },
      });
      push("Extra class added.");
      setForm({ date: "", slotOrder: "", duration: "1", section: "", subject: "", faculty: "", room: "", kind: "LECTURE", reason: "" });
      await onAdded();
    } catch (e) {
      const err = e as Error & { extra?: { reasons?: string[] } };
      setError(err.extra?.reasons ?? [err.message]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open} onClose={onClose}
      title="Add an extra class"
      description="A one-off session outside the regular timetable — a makeup class, a guest lecture, a revision hour. It is checked against every hard constraint but never counts towards an assignment's required sessions."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            <Plus className="size-3.5" /> Add class
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
        <Select label="Period" value={form.slotOrder} onChange={(e) => set("slotOrder", e.target.value)}>
          <option value="">Choose a period</option>
          {slots.filter((s) => s.kind === "CLASS").map((s) => (
            <option key={s.order} value={s.order}>{s.label} · {prettyTime(s.start)}</option>
          ))}
        </Select>
        <Select label="Length" value={form.duration} onChange={(e) => set("duration", e.target.value)}>
          <option value="1">1 period</option>
          <option value="2">2 periods</option>
          <option value="3">3 periods</option>
        </Select>
        <Select label="Kind" value={form.kind} onChange={(e) => set("kind", e.target.value)}>
          <option value="LECTURE">Lecture</option>
          <option value="LAB">Lab</option>
          <option value="TUTORIAL">Tutorial</option>
        </Select>
        <Select label="Section" value={form.section} onChange={(e) => set("section", e.target.value)}>
          <option value="">Choose a section</option>
          {directory.sections.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </Select>
        <Select label="Subject" value={form.subject} onChange={(e) => set("subject", e.target.value)}>
          <option value="">Choose a subject</option>
          {directory.subjects.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </Select>
        <Select label="Faculty" value={form.faculty} onChange={(e) => set("faculty", e.target.value)}>
          <option value="">Choose a faculty member</option>
          {directory.faculty.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </Select>
        <Select label="Room" value={form.room} onChange={(e) => set("room", e.target.value)}>
          <option value="">Choose a room</option>
          {rooms.map((r) => (
            <option key={r._id} value={r._id}>{r.block}-{r.code} · {r.capacity} seats · {r.type}</option>
          ))}
        </Select>
        <div className="sm:col-span-2">
          <Input label="Reason" value={form.reason} onChange={(e) => set("reason", e.target.value)}
            placeholder="Makeup for the Independence Day holiday" />
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded border border-line bg-surface/6 px-3 py-2">
          <p className="text-[0.8125rem] font-medium text-accent">This class cannot be added:</p>
          <ul className="mt-1 space-y-0.5">
            {error.map((r, i) => <li key={i} className="text-[0.8125rem] text-accent">{r}</li>)}
          </ul>
        </div>
      )}
    </Modal>
  );
}
