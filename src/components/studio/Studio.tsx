"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors, pointerWithin,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import {
  Undo2, Redo2, Wand2, Check, CloudOff, Loader2, Trash2, Filter,
} from "lucide-react";
import { api } from "@/hooks/useApi";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Select, Segmented } from "@/components/ui/Field";
import { StudioCanvas } from "./StudioCanvas";
import { SessionTray, type PendingSession } from "./SessionTray";
import { SessionBlock } from "./SessionBlock";
import { Inspector } from "./Inspector";
import { ContextMenu, type ContextTarget } from "./ContextMenu";
import { dropMap, availableRooms, requirementFromAssignment, type LiteEntry, type LiteRoom, type LiteSlot, type SchedulingRules, type Verdict } from "@/lib/scheduler/validate";
import { cn } from "@/lib/utils";

type Lens = "section" | "faculty" | "room";
type SaveState = "idle" | "saving" | "saved" | "error";

const uid = () => `tmp_${Math.random().toString(36).slice(2, 10)}`;

export function Studio({
  timetableId, initialEntries, assignments, slots, rooms, schedulingRules, teachingWeeks, readOnly,
}: {
  timetableId: string;
  initialEntries: LiteEntry[];
  assignments: any[];
  slots: LiteSlot[];
  rooms: LiteRoom[];
  schedulingRules: SchedulingRules;
  /** Teaching weeks in the semester — sizes the weekly pattern. */
  teachingWeeks?: number;
  readOnly?: boolean;
}) {
  const { push } = useToast();

  const [entries, setEntries] = useState<LiteEntry[]>(initialEntries);
  const [past, setPast] = useState<LiteEntry[][]>([]);
  const [future, setFuture] = useState<LiteEntry[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lens, setLens] = useState<Lens>("section");
  const [focus, setFocus] = useState<string>("");
  const [save, setSave] = useState<SaveState>("idle");
  const [filling, setFilling] = useState(false);
  const [menu, setMenu] = useState<ContextTarget | null>(null);

  const [drag, setDrag] = useState<
    | { kind: "entry"; entry: LiteEntry }
    | { kind: "pending"; pending: PendingSession }
    | null
  >(null);

  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Persistence ──────────────────────────────────────────────────── */

  const persist = useCallback(async (next: LiteEntry[]) => {
    setSave("saving");
    try {
      await api(`/api/timetables/${timetableId}/layout`, {
        method: "PUT",
        json: {
          entries: next.map((e) => ({
            assignment: (e as any).assignment,
            day: e.day, slotOrder: e.slotOrder, duration: e.duration,
            section: e.section._id, subject: e.subject._id,
            faculty: e.faculty._id, room: e.room._id,
            kind: e.kind, locked: !!e.locked,
          })),
        },
      });
      setSave("saved");
    } catch (err) {
      setSave("error");
      push((err as Error).message, "error");
    }
  }, [timetableId, push]);

  /** Every mutation goes through here: history, then a debounced save. */
  const commit = useCallback((next: LiteEntry[]) => {
    setPast((p) => [...p.slice(-49), entries]);
    setFuture([]);
    setEntries(next);
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(next), 700);
  }, [entries, persist]);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [entries, ...f]);
      setEntries(prev);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void persist(prev), 500);
      return p.slice(0, -1);
    });
  }, [entries, persist]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast((p) => [...p, entries]);
      setEntries(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void persist(next), 500);
      return f.slice(1);
    });
  }, [entries, persist]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (e.key === "Escape") { setSelectedId(null); setMenu(null); }
      const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(
        (e.target as HTMLElement)?.tagName
      );
      if (!typing && (e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        setEntries((cur) => {
          const next = cur.filter((x) => x._id !== selectedId);
          setPast((pp) => [...pp.slice(-49), cur]);
          setFuture([]);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void persist(next), 500);
          return next;
        });
        setSelectedId(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [undo, redo, selectedId, persist]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (save === "saving") { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  /* ── Derived data ─────────────────────────────────────────────────── */

  /**
   * Pattern cells from the Teaching Assignment that still have no slot.
   *
   * The pattern is sized from each assignment's semester total spread over the
   * teaching weeks — a course needing 40 sessions across 14 weeks wants 3 cells a
   * week. The exact total is settled later, when the pattern is expanded across
   * the calendar; this only has to get the weekly rhythm right.
   */
  const pending = useMemo<PendingSession[]>(() => {
    const weeks = teachingWeeks && teachingWeeks > 0 ? teachingWeeks : 14;
    const placed = new Map<string, number>();
    for (const e of entries) {
      const k = String((e as any).assignment);
      placed.set(k, (placed.get(k) ?? 0) + 1);
    }
    return assignments
      .map((a) => {
        const id = String(a._id);
        if (a.active === false) return null;
        const ideal = Math.ceil((a.requiredSessions ?? 1) / weeks);
        const want = Math.max(1, Math.min(6, Math.max(a.targetWeeklyFrequency || 0, ideal)));
        const remaining = want - (placed.get(id) ?? 0);
        if (remaining <= 0) return null;
        return {
          id, assignmentId: id,
          sectionId: String(a.section?._id), sectionNumber: a.section?.number ?? "?",
          sectionStrength: a.section?.strength ?? 0,
          subjectId: String(a.subject?._id), subjectCode: a.subject?.code ?? "?",
          subjectName: a.subject?.name ?? "",
          facultyId: String(a.faculty?._id), facultyName: a.faculty?.name ?? "",
          kind: a.kind, duration: a.duration,
          roomSelection: a.roomSelection ?? "AUTO",
          requiredRoomType: a.requiredRoomType,
          fixedRoomId: a.fixedRoom ? String(a.fixedRoom._id ?? a.fixedRoom) : undefined,
          allowedRoomIds: (a.allowedRooms ?? []).map((r: any) => String(r._id ?? r)),
          requiredCapabilities: a.requiredCapabilities ?? [],
          remaining,
        } as PendingSession;
      })
      .filter(Boolean) as PendingSession[];
  }, [assignments, entries, teachingWeeks]);

  const lensOptions = useMemo(() => {
    const m = new Map<string, string>();
    if (lens === "section") {
      for (const a of assignments) if (a.section) m.set(String(a.section._id), `Section ${a.section.number}`);
    } else if (lens === "faculty") {
      for (const a of assignments) if (a.faculty) m.set(String(a.faculty._id), a.faculty.name);
    } else {
      for (const r of rooms) m.set(r._id, `${r.block}-${r.code}`);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [assignments, rooms, lens]);

  const visible = useMemo(() => {
    if (!focus) return entries;
    return entries.filter((e) => String((e as any)[lens]?._id) === focus);
  }, [entries, focus, lens]);

  const selected = entries.find((e) => e._id === selectedId) ?? null;

  /* ── Drag ─────────────────────────────────────────────────────────── */

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor)
  );

  const candidate = useMemo(() => {
    if (!drag) return null;
    if (drag.kind === "entry") {
      const e = drag.entry;
      const a = assignments.find((x) => String(x._id) === String((e as any).assignment));
      return {
        entryId: e._id,
        assignmentId: (e as any).assignment ? String((e as any).assignment) : undefined,
        duration: e.duration, kind: e.kind,
        sectionId: e.section._id, sectionStrength: e.section.strength ?? 0,
        facultyId: e.faculty._id, roomId: e.room._id,
        roomSelection: a?.roomSelection ?? "AUTO",
        requiredRoomType: a?.requiredRoomType,
        fixedRoomId: a?.fixedRoom ? String(a.fixedRoom._id ?? a.fixedRoom) : undefined,
        allowedRoomIds: (a?.allowedRooms ?? []).map((r: any) => String(r._id ?? r)),
        requiredCapabilities: a?.requiredCapabilities ?? [],
      };
    }
    const p = drag.pending;
    return {
      assignmentId: p.assignmentId,
      duration: p.duration, kind: p.kind,
      sectionId: p.sectionId, sectionStrength: p.sectionStrength,
      facultyId: p.facultyId,
      roomSelection: p.roomSelection ?? "AUTO",
      requiredRoomType: p.requiredRoomType,
      fixedRoomId: p.fixedRoomId,
      allowedRoomIds: p.allowedRoomIds ?? [],
      requiredCapabilities: p.requiredCapabilities ?? [],
    };
  }, [drag, assignments]);

  /** Recomputed once per drag, then read O(1) per cell as the pointer moves. */
  const verdicts = useMemo<Map<string, Verdict> | null>(() => {
    if (!candidate) return null;
    const room = candidate.roomId ? rooms.find((r) => r._id === candidate.roomId) : undefined;
    return dropMap(candidate as any, slots, entries, schedulingRules, room);
  }, [candidate, slots, entries, schedulingRules, rooms]);

  function onDragStart(ev: DragStartEvent) {
    const d = ev.active.data.current as any;
    if (d?.type === "entry") setDrag({ kind: "entry", entry: d.entry });
    if (d?.type === "pending") setDrag({ kind: "pending", pending: d.pending });
  }

  function onDragEnd(ev: DragEndEvent) {
    const current = drag;
    setDrag(null);
    if (!current || !ev.over) return;

    const overId = String(ev.over.id);
    if (!overId.startsWith("cell:")) return;
    const [, dStr, oStr] = overId.split(":");
    const day = Number(dStr);
    const slotOrder = Number(oStr);

    const verdict = verdicts?.get(`${day}:${slotOrder}`);
    if (!verdict || !verdict.ok) {
      push(verdict && !verdict.ok ? verdict.reason : "That slot won't work.", "error");
      return;
    }

    if (current.kind === "entry") {
      const e = current.entry;
      if (e.day === day && e.slotOrder === slotOrder) return;
      commit(entries.map((x) => (x._id === e._id ? { ...x, day, slotOrder } : x)));
      return;
    }

    // From the tray: choose the tightest room that is free right now.
    const p = current.pending;
    const free = availableRooms(candidate as any, day, slotOrder, rooms, entries).find((r) => r.free);
    if (!free) {
      push("No suitable room is free in that period.", "error");
      return;
    }
    const created: LiteEntry = {
      _id: uid(),
      day, slotOrder, duration: p.duration, kind: p.kind, locked: false,
      section: { _id: p.sectionId, number: p.sectionNumber, strength: p.sectionStrength },
      subject: { _id: p.subjectId, code: p.subjectCode, name: p.subjectName },
      faculty: { _id: p.facultyId, name: p.facultyName },
      room: free.room,
    };
    (created as any).assignment = p.assignmentId;
    commit([...entries, created]);
    setSelectedId(created._id);

    // Don't let a filter swallow the thing that was just placed.
    const hidden =
      (lens === "section" && focus && focus !== p.sectionId) ||
      (lens === "faculty" && focus && focus !== p.facultyId) ||
      (lens === "room" && focus && focus !== free.room._id);
    if (hidden) {
      setFocus("");
      push(`Placed ${p.subjectCode}. Cleared the filter so you can see it.`);
    }
  }

  /* ── Actions ──────────────────────────────────────────────────────── */

  async function autofill() {
    setFilling(true);
    try {
      if (timer.current) clearTimeout(timer.current);
      await persist(entries);
      const res = await api<{ added: number; unplaced: { reason: string }[] }>(
        `/api/timetables/${timetableId}/autofill`, { method: "POST" }
      );
      const fresh = await api<any>(`/api/timetables/${timetableId}`);
      setPast((p) => [...p, entries]);
      setEntries(fresh.entries);
      push(
        res.added > 0
          ? `Placed ${res.added} session${res.added === 1 ? "" : "s"}.`
          : "Nothing left to place."
      );
      if (res.unplaced?.length) push(res.unplaced[0].reason, "error");
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setFilling(false);
    }
  }

  function clearUnpinned() {
    const removable = entries.filter((e) => !e.locked).length;
    if (removable === 0) { push("Nothing to clear — every session is pinned."); return; }
    if (!confirm(
      `Take ${removable} unpinned session${removable === 1 ? "" : "s"} off the canvas?\n\n` +
      `${entries.length - removable} pinned session(s) will stay. You can undo this with Cmd+Z.`
    )) return;
    commit(entries.filter((e) => e.locked));
    setSelectedId(null);
  }

  const mutate = (fn: (e: LiteEntry) => LiteEntry) => {
    if (!selected) return;
    commit(entries.map((x) => (x._id === selected._id ? fn(x) : x)));
  };

  const placedCount = entries.length;
  const pendingCount = pending.reduce((n, s) => n + s.remaining, 0);
  const progress = placedCount + pendingCount === 0
    ? 0 : Math.round((placedCount / (placedCount + pendingCount)) * 100);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDrag(null)}
    >
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 -mx-4 mb-4 border-b border-rule bg-ground/85 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
              <option value="">All {lens === "faculty" ? "faculty" : `${lens}s`}</option>
              {lensOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </div>

          <div className="h-5 w-px bg-rule-strong" />

          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="sm" onClick={undo} disabled={past.length === 0} aria-label="Undo">
              <Undo2 className="size-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={redo} disabled={future.length === 0} aria-label="Redo">
              <Redo2 className="size-3.5" />
            </Button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Completion is the number that matters, so it is always on screen */}
            <div className="hidden items-center gap-2 sm:flex">
              <div className="h-1 w-24 overflow-hidden rounded-full bg-ink/10">
                <div
                  className={cn("h-full rounded-full", progress === 100 ? "bg-accent" : "bg-accent/80")}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="font-mono text-[0.68rem] text-muted tnum">
                {placedCount}/{placedCount + pendingCount}
              </span>
            </div>

            <SaveBadge state={save} />

            <Button variant="ghost" size="sm" onClick={clearUnpinned}
              title="Remove every unpinned session from the canvas">
              <Trash2 className="size-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
            <Button size="sm" onClick={autofill} loading={filling} disabled={pendingCount === 0}>
              <Wand2 className="size-3.5" />
              Fill remaining
            </Button>
          </div>
        </div>
      </div>

      {/* ── Three-pane workspace ────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-[15rem_minmax(0,1fr)_16rem]">
        <aside className="order-2 flex max-h-[32rem] flex-col rounded-md border border-rule bg-sheet py-3 shadow-hair xl:order-1 xl:max-h-[calc(100vh-9rem)] xl:sticky xl:top-[4.25rem]">
          <SessionTray pending={pending} filterSectionId={lens === "section" ? focus || null : null} />
        </aside>

        <div className="order-1 min-w-0 xl:order-2">
          <StudioCanvas
            slots={slots}
            entries={visible}
            days={schedulingRules.workingDays}
            dropVerdicts={verdicts}
            dragActive={!!drag}
            dragSpan={candidate?.duration ?? 1}
            selectedId={selectedId}
            onSelect={(e) => setSelectedId(e?._id ?? null)}
            onContext={(e, x, y) => setMenu({ entry: e, x, y })}
            lens={lens}
          />
          <p className="mt-2 px-1 text-micro text-muted">
            Drag from the tray onto the sheet, or move a placed session. Hatched cells
            can&apos;t take it — hover one to see why. Right-click a session for room, pin
            and remove. <kbd className="font-mono">Del</kbd> removes the selected one,
            <kbd className="ml-1 font-mono">⌘Z</kbd> undoes.
          </p>
        </div>

        <aside className="order-3 rounded-md border border-rule bg-sheet shadow-hair xl:sticky xl:top-[4.25rem] xl:max-h-[calc(100vh-9rem)]">
          <Inspector
            entry={selected}
            rooms={rooms}
            entries={entries}
            slots={slots}
            onChangeRoom={(roomId) => {
              const room = rooms.find((r) => r._id === roomId);
              if (room) mutate((e) => ({ ...e, room }));
            }}
            onToggleLock={() => mutate((e) => ({ ...e, locked: !e.locked }))}
            onRemove={() => {
              if (!selected) return;
              commit(entries.filter((x) => x._id !== selected._id));
              setSelectedId(null);
            }}
          />
        </aside>
      </div>

      <ContextMenu
        target={menu}
        rooms={rooms}
        entries={entries}
        onClose={() => setMenu(null)}
        onChangeRoom={(roomId) => {
          const room = rooms.find((r) => r._id === roomId);
          if (room && menu) commit(entries.map((x) => (x._id === menu.entry._id ? { ...x, room } : x)));
        }}
        onToggleLock={() => {
          if (!menu) return;
          commit(entries.map((x) => (x._id === menu.entry._id ? { ...x, locked: !x.locked } : x)));
        }}
        onRemove={() => {
          if (!menu) return;
          commit(entries.filter((x) => x._id !== menu.entry._id));
          setSelectedId(null);
        }}
      />

      {/* The block follows the cursor, tilted slightly, so it reads as lifted */}
      <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(.2,.9,.3,1)" }}>
        {drag && (
          <div className="w-40 rotate-[-1.5deg] shadow-drag" style={{ height: drag.kind === "entry" ? 56 : 52 }}>
            {drag.kind === "entry" ? (
              <SessionBlock entry={drag.entry} compact />
            ) : (
              <div className="flex h-full flex-col justify-center rounded-sm border border-line bg-sheet px-2">
                <span className="font-mono text-[0.7rem] font-semibold">{drag.pending.subjectCode}</span>
                <span className="truncate text-[0.65rem] text-muted">{drag.pending.facultyName}</span>
              </div>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  const map = {
    idle: { icon: null, text: "", cls: "text-muted" },
    saving: { icon: <Loader2 className="size-3 animate-spin" />, text: "Saving", cls: "text-muted" },
    saved: { icon: <Check className="size-3" />, text: "Saved", cls: "text-accent" },
    error: { icon: <CloudOff className="size-3" />, text: "Not saved", cls: "text-ink" },
  }[state];

  return (
    <>
      {map.text && (
        <span key={state} className={cn("flex items-center gap-1 font-mono text-[0.65rem] uppercase tracking-wide", map.cls)}>
          {map.icon}{map.text}
        </span>
      )}
    </>
  );
}
