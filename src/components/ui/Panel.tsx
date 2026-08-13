import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** The standard bordered surface. One radius, one shadow, used everywhere. */
export function Panel({
  children, className, flush,
}: { children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cn(
      "rounded-md border border-rule bg-sheet shadow-hair",
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
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h3 className="label">{title}</h3>
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
        "mt-1.5 font-display text-3xl leading-none tracking-[-0.02em] tnum",
        tone === "claret" && "text-claret", tone === "moss" && "text-moss"
      )}>
        {value}
      </p>
      {sub && <p className="mt-1.5 text-micro leading-snug text-muted">{sub}</p>}
    </div>
  );
}
