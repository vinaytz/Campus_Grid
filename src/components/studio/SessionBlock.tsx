"use client";
import { cn } from "@/lib/utils";
import { Lock, GripVertical } from "lucide-react";
import type { LiteEntry } from "@/lib/scheduler/validate";

const ACCENT: Record<string, { bar: string; tint: string }> = {
  LECTURE: { bar: "bg-lapis", tint: "hover:bg-lapis-soft/50" },
  LAB: { bar: "bg-moss", tint: "hover:bg-moss-soft/50" },
  TUTORIAL: { bar: "bg-ochre", tint: "hover:bg-ochre-soft/50" },
};

/**
 * One placed session. The left rule carries the kind, so the canvas can be read
 * by colour at a glance without a legend lookup.
 */
export function SessionBlock({
  entry, selected, dragging, compact, showFaculty = true, showRoom = true, showSection,
  onClick, handleProps,
}: {
  entry: LiteEntry;
  selected?: boolean;
  dragging?: boolean;
  compact?: boolean;
  showFaculty?: boolean;
  showRoom?: boolean;
  showSection?: boolean;
  onClick?: () => void;
  handleProps?: Record<string, unknown>;
}) {
  const accent = ACCENT[entry.kind] ?? ACCENT.LECTURE;

  return (
    <div
      onClick={onClick}
      {...handleProps}
      className={cn(
        "group relative flex h-full w-full cursor-grab select-none flex-col overflow-hidden rounded-sm",
        "border bg-sheet pl-2 pr-1.5 py-1 text-left transition-all duration-150 ease-physical",
        "active:cursor-grabbing",
        selected
          ? "border-claret shadow-[0_0_0_1px_theme(colors.claret.DEFAULT)]"
          : "border-rule-strong/60 hover:border-graphite-400 hover:shadow-hair",
        accent.tint,
        dragging && "opacity-30"
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", accent.bar)} />

      <div className="flex items-start justify-between gap-1">
        <span className="font-mono text-[0.7rem] font-semibold leading-tight tracking-[-0.01em] text-ink">
          {entry.subject.code}
        </span>
        <span className="flex shrink-0 items-center gap-0.5">
          {entry.locked && <Lock className="size-2.5 text-claret" />}
          <GripVertical className="size-3 text-transparent transition-colors group-hover:text-muted/50" />
        </span>
      </div>

      {!compact && (
        <span className="truncate text-[0.7rem] leading-tight text-muted">
          {entry.subject.name}
        </span>
      )}

      <span className="mt-auto flex flex-wrap items-center gap-x-1.5 pt-0.5 text-[0.65rem] leading-tight text-muted">
        {showFaculty && <span className="truncate">{entry.faculty.name}</span>}
        {showRoom && (
          <span className="font-mono text-graphite-500">
            {entry.room.block}-{entry.room.code}
          </span>
        )}
        {showSection && <span className="font-mono text-graphite-500">§{entry.section.number}</span>}
      </span>
    </div>
  );
}
