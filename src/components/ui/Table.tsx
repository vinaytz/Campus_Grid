import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("thin-scroll overflow-x-auto rounded-md border border-rule bg-sheet shadow-hair", className)}>
      <table className="w-full border-collapse text-[0.8125rem]">{children}</table>
    </div>
  );
}

export function TH({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th className={cn(
      "sticky top-0 z-10 whitespace-nowrap border-b border-rule bg-sheet/95 px-3 py-2",
      "text-left text-label font-medium uppercase text-muted backdrop-blur",
      className
    )}>
      {children}
    </th>
  );
}

export function TD({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("border-b border-rule/70 px-3 py-2 align-middle", className)}>{children}</td>;
}

export function EmptyState({
  icon, title, hint, action,
}: { icon?: ReactNode; title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex size-10 items-center justify-center rounded border border-dashed border-rule-strong text-muted">
        {icon ?? <span className="font-mono text-sm">∅</span>}
      </div>
      <div>
        <p className="font-display text-base tracking-[-0.01em]">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-[0.8125rem] leading-relaxed text-muted">{hint}</p>
      </div>
      {action}
    </div>
  );
}
