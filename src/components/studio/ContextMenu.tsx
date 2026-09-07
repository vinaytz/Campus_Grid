"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Lock, LockOpen, Trash2, DoorOpen, ArrowRightLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { availableRooms, type Candidate, type LiteEntry, type LiteRoom } from "@/lib/scheduler/validate";

export type ContextTarget = { entry: LiteEntry; x: number; y: number };

/**
 * Right-click menu on a placed session. The common edits — swap the room, pin,
 * remove — should not require a trip to the inspector.
 */
export function ContextMenu({
  target, rooms, entries, requirement, onClose, onChangeRoom, onToggleLock, onRemove,
}: {
  target: ContextTarget | null;
  rooms: LiteRoom[];
  entries: LiteEntry[];
  /** The assignment's room rules, so a forbidden room is never offered. */
  requirement?: Partial<Candidate>;
  onClose: () => void;
  onChangeRoom: (roomId: string) => void;
  onToggleLock: () => void;
  onRemove: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [rooming, setRooming] = useState(false);

  useEffect(() => { setRooming(false); }, [target]);

  useEffect(() => {
    if (!target) return;
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [target, onClose]);

  if (!target) return null;
  const { entry } = target;

  const options = availableRooms(
    {
      entryId: entry._id, duration: entry.duration, kind: entry.kind,
      sectionId: entry.section._id, sectionStrength: entry.section.strength ?? 0,
      facultyId: entry.faculty._id,
      ...requirement,
    },
    entry.day, entry.slotOrder, rooms, entries
  );

  // Keep the menu on screen near the edges
  const x = Math.min(target.x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 240);
  const y = Math.min(target.y, (typeof window !== "undefined" ? window.innerHeight : 9999) - 300);

  const Item = ({ icon, label, onClick, danger }: {
    icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean;
  }) => (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-left text-[0.8125rem] transition-colors",
        danger ? "text-claret hover:bg-claret-soft" : "text-ink hover:bg-ink/[.055]"
      )}
    >
      {icon}{label}
    </button>
  );

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.12, ease: [0.2, 0.9, 0.3, 1] }}
      style={{ left: x, top: y }}
      className="fixed z-[70] w-56 rounded-md border border-rule bg-sheet p-1 shadow-lift"
    >
      <div className="border-b border-rule px-2 pb-1.5 pt-1">
        <p className="font-mono text-[0.7rem] font-semibold">{entry.subject.code}</p>
        <p className="truncate text-micro text-muted">
          {entry.faculty.name} · §{entry.section.number}
        </p>
      </div>

      {rooming ? (
        <div className="thin-scroll max-h-56 overflow-y-auto py-1">
          {options.map(({ room, free, reason }) => (
            <button
              key={room._id}
              disabled={!free && room._id !== entry.room._id}
              onClick={() => { onChangeRoom(room._id); onClose(); }}
              className={cn(
                "flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-left text-[0.8125rem] transition-colors",
                free || room._id === entry.room._id
                  ? "hover:bg-ink/[.055]" : "cursor-not-allowed opacity-45"
              )}
            >
              <span className="w-14 shrink-0 font-mono text-[0.72rem]">{room.block}-{room.code}</span>
              <span className="font-mono text-micro text-muted tnum">{room.capacity}</span>
              <span className="ml-auto truncate text-micro text-muted">
                {room._id === entry.room._id ? <Check className="size-3 text-claret" /> : free ? "" : reason}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="py-1">
          <Item icon={<DoorOpen className="size-3.5 text-muted" />} label="Change room…"
            onClick={() => setRooming(true)} />
          <Item
            icon={entry.locked ? <LockOpen className="size-3.5 text-muted" /> : <Lock className="size-3.5 text-muted" />}
            label={entry.locked ? "Unpin" : "Pin in place"}
            onClick={() => { onToggleLock(); onClose(); }}
          />
          <div className="my-1 border-t border-rule" />
          <Item icon={<Trash2 className="size-3.5" />} label="Take off the canvas" danger
            onClick={() => { onRemove(); onClose(); }} />
        </div>
      )}

      {!rooming && (
        <p className="flex items-start gap-1.5 border-t border-rule px-2 py-1.5 text-[0.68rem] leading-snug text-muted">
          <ArrowRightLeft className="mt-px size-3 shrink-0" />
          To change who teaches this, edit it under Teaching load.
        </p>
      )}
    </motion.div>
  );
}
