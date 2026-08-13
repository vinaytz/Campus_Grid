"use client";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { cn, prettyTime } from "@/lib/utils";
import { DAY_NAMES, DAY_SHORT } from "@/lib/constants";
import { SessionBlock } from "./SessionBlock";
import type { LiteEntry, LiteSlot, Verdict } from "@/lib/scheduler/validate";

const ROW = 62;

function DropCell({
  day, order, verdict, active, span,
}: { day: number; order: number; verdict?: Verdict; active: boolean; span: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell:${day}:${order}` });
  const allowed = verdict?.ok === true;

  return (
    <div
      ref={setNodeRef}
      title={verdict && !verdict.ok ? verdict.reason : undefined}
      className={cn(
        "relative border-b border-r border-rule/70 transition-colors duration-100",
        active && !allowed && "hatch",
        active && allowed && "bg-moss-soft/40",
        isOver && allowed && "bg-moss-soft ring-1 ring-inset ring-moss",
        isOver && !allowed && "bg-claret-soft ring-1 ring-inset ring-claret-line"
      )}
    >
      {/* Preview of the full span a multi-period session would occupy */}
      {isOver && allowed && span > 1 && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 rounded-sm border border-dashed border-moss bg-moss-soft/60"
          style={{ height: span * ROW - 1 }}
        />
      )}
      {isOver && !allowed && verdict && !verdict.ok && (
        <div className="pointer-events-none absolute inset-x-1 top-1 z-20 rounded-xs bg-graphite-900 px-1.5 py-1 text-[0.65rem] leading-snug text-white shadow-lift">
          {verdict.reason}
        </div>
      )}
    </div>
  );
}

function PlacedBlock({
  entry, rowIndex, dayIndex, selected, onSelect, lens,
}: {
  entry: LiteEntry; rowIndex: number; dayIndex: number;
  selected: boolean; onSelect: () => void; lens: "section" | "faculty" | "room";
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `entry:${entry._id}`,
    data: { type: "entry", entry },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        gridColumn: dayIndex + 2,
        gridRow: `${rowIndex + 1} / span ${entry.duration}`,
      }}
      className="relative z-10 p-[3px]"
    >
      <SessionBlock
        entry={entry}
        selected={selected}
        dragging={isDragging}
        compact={entry.duration === 1}
        showFaculty={lens !== "faculty"}
        showRoom={lens !== "room"}
        showSection={lens !== "section"}
        onClick={onSelect}
        handleProps={{ ...listeners, ...attributes }}
      />
    </div>
  );
}

/**
 * The drawing sheet. Rows are periods, columns are days, and a multi-period
 * session is one block spanning its rows — the shape of the week is the point.
 */
export function StudioCanvas({
  slots, entries, days, dropVerdicts, dragActive, dragSpan,
  selectedId, onSelect, lens,
}: {
  slots: LiteSlot[];
  entries: LiteEntry[];
  days: number[];
  dropVerdicts: Map<string, Verdict> | null;
  dragActive: boolean;
  dragSpan: number;
  selectedId: string | null;
  onSelect: (e: LiteEntry | null) => void;
  lens: "section" | "faculty" | "room";
}) {
  const ordered = [...slots].sort((a, b) => a.order - b.order);
  const rowOf = new Map(ordered.map((s, i) => [s.order, i]));

  return (
    <div className="thin-scroll overflow-x-auto rounded-md border border-rule bg-sheet shadow-sheet">
      <div className="min-w-[46rem]">
        {/* Day header */}
        <div
          className="sticky top-0 z-30 grid border-b border-rule-strong bg-sheet/95 backdrop-blur"
          style={{ gridTemplateColumns: `76px repeat(${days.length}, minmax(0,1fr))` }}
        >
          <div className="border-r border-rule px-2 py-2">
            <span className="label">Period</span>
          </div>
          {days.map((d) => (
            <div key={d} className="border-r border-rule px-2 py-2 last:border-r-0">
              <span className="text-[0.8125rem] font-semibold tracking-[-0.01em]">
                <span className="hidden sm:inline">{DAY_NAMES[d]}</span>
                <span className="sm:hidden">{DAY_SHORT[d]}</span>
              </span>
            </div>
          ))}
        </div>

        {/* Canvas body */}
        <div
          className="sheet-grid relative grid"
          style={{
            gridTemplateColumns: `76px repeat(${days.length}, minmax(0,1fr))`,
            gridAutoRows: `${ROW}px`,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) onSelect(null); }}
        >
          {ordered.map((slot, rowIndex) => (
            <div
              key={`t${slot.order}`}
              style={{ gridColumn: 1, gridRow: rowIndex + 1 }}
              className="flex flex-col justify-center border-b border-r border-rule bg-sheet px-2"
            >
              <span className="font-mono text-[0.68rem] font-medium leading-tight tnum">
                {prettyTime(slot.start)}
              </span>
              <span className="font-mono text-[0.62rem] leading-tight text-muted tnum">
                {prettyTime(slot.end)}
              </span>
            </div>
          ))}

          {ordered.map((slot, rowIndex) =>
            slot.kind === "BREAK" ? (
              <div
                key={`b${slot.order}`}
                style={{ gridColumn: `2 / span ${days.length}`, gridRow: rowIndex + 1 }}
                className="flex items-center justify-center border-b border-rule bg-ground/70"
              >
                <span className="label text-muted/80">{slot.label}</span>
              </div>
            ) : (
              days.map((day) => (
                <div key={`c${day}-${slot.order}`}
                  style={{ gridColumn: days.indexOf(day) + 2, gridRow: rowIndex + 1 }}>
                  <DropCell
                    day={day} order={slot.order}
                    verdict={dropVerdicts?.get(`${day}:${slot.order}`)}
                    active={dragActive}
                    span={dragSpan}
                  />
                </div>
              ))
            )
          )}

          {entries.map((e) => {
            const rowIndex = rowOf.get(e.slotOrder);
            const dayIndex = days.indexOf(e.day);
            if (rowIndex === undefined || dayIndex < 0) return null;
            return (
              <PlacedBlock
                key={e._id} entry={e} rowIndex={rowIndex} dayIndex={dayIndex}
                selected={selectedId === e._id}
                onSelect={() => onSelect(e)}
                lens={lens}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
