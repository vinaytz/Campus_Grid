"use client";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge, Swatch } from "@/components/ui/Badge";
import { Lock, LockOpen, Trash2, DoorOpen } from "lucide-react";
import { availableRooms, type LiteEntry, type LiteRoom } from "@/lib/scheduler/validate";
import { DAY_NAMES, prettyTimeSafe } from "@/lib/constants";

/** Details and controls for the session currently selected on the canvas. */
export function Inspector({
  entry, rooms, entries, slots, onChangeRoom, onToggleLock, onRemove,
}: {
  entry: LiteEntry | null;
  rooms: LiteRoom[];
  entries: LiteEntry[];
  slots: { order: number; start: string; label: string }[];
  onChangeRoom: (roomId: string) => void;
  onToggleLock: () => void;
  onRemove: () => void;
}) {
  const options = useMemo(() => {
    if (!entry) return [];
    return availableRooms(
      {
        entryId: entry._id,
        duration: entry.duration,
        kind: entry.kind,
        sectionId: entry.section._id,
        sectionStrength: entry.section.strength ?? 0,
        facultyId: entry.faculty._id,
      },
      entry.day, entry.slotOrder, rooms, entries
    );
  }, [entry, rooms, entries]);

  if (!entry) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-5 text-center">
        <div className="flex size-9 items-center justify-center rounded border border-dashed border-rule-strong">
          <DoorOpen className="size-4 text-muted" />
        </div>
        <p className="text-[0.8125rem] font-medium">Nothing selected</p>
        <p className="text-micro leading-snug text-muted">
          Pick a session on the canvas to change its room, pin it, or take it off.
        </p>
      </div>
    );
  }

  const slot = slots.find((s) => s.order === entry.slotOrder);

  return (
    <div className="thin-scroll flex h-full flex-col overflow-y-auto">
      <div className="border-b border-rule px-4 py-3.5">
        <div className="flex items-center gap-1.5">
          <Swatch kind={entry.kind} />
          <span className="font-mono text-sm font-semibold tracking-[-0.01em]">{entry.subject.code}</span>
          <Badge tone="neutral" className="ml-auto">{entry.kind}</Badge>
        </div>
        <p className="mt-1 text-[0.8125rem] leading-snug text-muted">{entry.subject.name}</p>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-3 border-b border-rule px-4 py-3.5 text-[0.8125rem]">
        <div>
          <dt className="label mb-1">Section</dt>
          <dd className="font-mono">{entry.section.number}</dd>
        </div>
        <div>
          <dt className="label mb-1">Students</dt>
          <dd className="font-mono tnum">{entry.section.strength ?? "—"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="label mb-1">Faculty</dt>
          <dd>{entry.faculty.name}</dd>
        </div>
        <div>
          <dt className="label mb-1">Day</dt>
          <dd>{DAY_NAMES[entry.day]}</dd>
        </div>
        <div>
          <dt className="label mb-1">Starts</dt>
          <dd className="font-mono tnum">{prettyTimeSafe(slot?.start)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="label mb-1">Length</dt>
          <dd className="font-mono tnum">
            {entry.duration} period{entry.duration > 1 ? "s" : ""} back to back
          </dd>
        </div>
      </dl>

      <div className="border-b border-rule px-4 py-3.5">
        <p className="label mb-2">Room</p>
        <p className="mb-2 text-micro leading-snug text-muted">
          Free rooms first, then ones busy in this period, then ones that can never fit.
        </p>
        <div className="space-y-1">
          {options.slice(0, 9).map(({ room, free, tier, reason }) => {
            const current = room._id === entry.room._id;
            return (
              <button
                key={room._id}
                disabled={!free && !current}
                onClick={() => onChangeRoom(room._id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm border px-2 py-1.5 text-left transition-colors duration-150",
                  current
                    ? "border-claret bg-claret-soft"
                    : free
                    ? "border-rule-strong/60 bg-sheet hover:border-graphite-400"
                    : tier === 1
                    ? "cursor-not-allowed border-rule bg-ground/40 opacity-75"
                    : "cursor-not-allowed border-rule bg-ground/30 opacity-50"
                )}
              >
                <span className="font-mono text-[0.72rem] font-semibold">
                  {room.block}-{room.code}
                </span>
                <span className="font-mono text-[0.65rem] text-muted tnum">{room.capacity} seats</span>
                <span className="ml-auto text-[0.62rem] text-muted">
                  {current ? "Current" : free ? room.type.toLowerCase() : reason}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-auto space-y-2 px-4 py-3.5">
        <Button
          variant={entry.locked ? "primary" : "secondary"}
          size="sm" className="w-full" onClick={onToggleLock}
        >
          {entry.locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
          {entry.locked ? "Pinned — autofill will not move it" : "Pin this session"}
        </Button>
        <Button variant="danger" size="sm" className="w-full" onClick={onRemove}>
          <Trash2 className="size-3.5" />
          Take off the canvas
        </Button>
      </div>
    </div>
  );
}
