"use client";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Swatch } from "@/components/ui/Badge";
import { CheckCircle2 } from "lucide-react";

export type PendingSession = {
  id: string;
  assignmentId: string;
  sectionId: string;
  sectionNumber: string;
  sectionStrength: number;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  facultyId: string;
  facultyName: string;
  kind: string;
  duration: number;
  roomSelection?: "AUTO" | "FIXED" | "ALLOWED_ROOMS";
  requiredRoomType?: string;
  fixedRoomId?: string;
  allowedRoomIds?: string[];
  requiredCapabilities?: string[];
  remaining: number;
};

function TrayItem({ s, dimmed }: { s: PendingSession; dimmed: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pending:${s.id}`,
    data: { type: "pending", pending: s },
  });

  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      className={cn(
        "group cursor-grab select-none rounded-sm border border-rule-strong/60 bg-sheet px-2 py-1.5",
        "transition-all duration-150 ease-physical hover:border-ink/60 active:cursor-grabbing",
        isDragging && "opacity-30",
        dimmed && "opacity-45"
      )}
    >
      <div className="flex items-center gap-1.5">
        <Swatch kind={s.kind} />
        <span className="font-mono text-[0.7rem] font-semibold tracking-[-0.01em]">{s.subjectCode}</span>
        <span className="ml-auto flex items-center gap-1">
          {s.duration > 1 && (
            <span className="rounded-xs bg-ink/[.06] px-1 font-mono text-[0.6rem] text-muted">
              {s.duration}h
            </span>
          )}
          <span className="flex size-[17px] items-center justify-center rounded-xs bg-claret font-mono text-[0.62rem] font-semibold text-white tnum">
            {s.remaining}
          </span>
        </span>
      </div>
      <p className="mt-0.5 truncate text-[0.7rem] leading-tight text-muted">{s.subjectName}</p>
      <p className="truncate text-[0.65rem] leading-tight text-muted/80">
        {s.facultyName} · §{s.sectionNumber}
      </p>
    </div>
  );
}

/** Weekly pattern cells still waiting to be placed. Empty here means the week is complete. */
export function SessionTray({
  pending, filterSectionId,
}: { pending: PendingSession[]; filterSectionId: string | null }) {
  if (pending.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
        <CheckCircle2 className="size-5 text-moss" />
        <p className="text-[0.8125rem] font-medium">The week is complete</p>
        <p className="text-micro leading-snug text-muted">
          Every assignment has its weekly cells on the canvas. Apply the pattern to
          the semester to turn it into dated sessions.
        </p>
      </div>
    );
  }

  const total = pending.reduce((n, s) => n + s.remaining, 0);

  return (
    <>
      <div className="flex items-baseline justify-between px-3 pb-2">
        <span className="label">To place</span>
        <span className="font-mono text-[0.68rem] text-muted tnum">{total}</span>
      </div>
      <div className="thin-scroll flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
        {pending.map((s) => (
          <TrayItem key={s.id} s={s} dimmed={!!filterSectionId && s.sectionId !== filterSectionId} />
        ))}
      </div>
    </>
  );
}
