import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const TONES = {
  neutral: "bg-surface/6 text-muted",
  claret: "bg-surface/6 text-muted",
  moss: "bg-surface/6 text-muted",
  ochre: "bg-surface/6 text-muted",
  lapis: "bg-surface/6 text-muted",
  dark: "bg-ink text-white",
};

export function Badge({
  children, tone = "neutral", className,
}: { children: ReactNode; tone?: keyof typeof TONES; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[0.625rem] font-semibold uppercase leading-none tracking-[0.06em]",
      TONES[tone], className
    )}>
      {children}
    </span>
  );
}

/** A small square of colour used to key session kinds on the canvas. */
export function Swatch({ kind, className }: { kind: string; className?: string }) {
  const map: Record<string, string> = {
    LECTURE: "bg-accent", LAB: "bg-accent/70", TUTORIAL: "bg-accent/40",
  };
  return <span className={cn("size-2 rounded-[1px]", map[kind] ?? "bg-ink/30", className)} />;
}
