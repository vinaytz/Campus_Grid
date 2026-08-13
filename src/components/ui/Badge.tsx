import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const TONES = {
  neutral: "bg-ink/[.05] text-muted",
  claret: "bg-claret-soft text-claret",
  moss: "bg-moss-soft text-moss",
  ochre: "bg-ochre-soft text-ochre",
  lapis: "bg-lapis-soft text-lapis",
  dark: "bg-graphite-900 text-white",
};

export function Badge({
  children, tone = "neutral", className,
}: { children: ReactNode; tone?: keyof typeof TONES; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-xs px-1.5 py-[3px] font-mono text-[0.625rem] font-medium uppercase leading-none tracking-[0.06em]",
      TONES[tone], className
    )}>
      {children}
    </span>
  );
}

/** A small square of colour used to key session kinds on the canvas. */
export function Swatch({ kind, className }: { kind: string; className?: string }) {
  const map: Record<string, string> = {
    LECTURE: "bg-lapis", LAB: "bg-moss", TUTORIAL: "bg-ochre",
  };
  return <span className={cn("size-2 rounded-[1px]", map[kind] ?? "bg-graphite-400", className)} />;
}
