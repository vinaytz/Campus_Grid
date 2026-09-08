import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** The standard bordered surface. One radius, one shadow, used everywhere. */
export function Panel({
  children, className, flush,
}: { children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cn(
      "rounded-md border border-line bg-surface",
      !flush && "p-4",
      className
    )}>
      {children}
    </section>
  );
}

export function PanelHead({
  title, action, className,
}: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex items-center justify-between gap-3", className)}>
      <h3 className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">{title}</h3>
      {action}
    </div>
  );
}

/** A labelled figure. The number is the point, so it carries the display face. */
export function Stat({
  label, value, sub, tone,
}: { label: string; value: ReactNode; sub?: ReactNode; tone?: "claret" | "moss" }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className={cn(
        "mt-2 font-sans text-2xl leading-none tracking-[-0.01em] tnum text-ink",
        tone === "claret" && "text-claret", tone === "moss" && "text-moss"
      )}>
        {value}
      </p>
      {sub && <p className="mt-1.5 text-micro leading-snug text-muted">{sub}</p>}
    </div>
  );
}
