import type { ReactNode } from "react";

export function PageHeader({
  eyebrow, title, description, action,
}: { eyebrow?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-4">
      <div className="min-w-0">
        {eyebrow && <p className="label mb-1.5">{eyebrow}</p>}
        <h1 className="font-display text-[1.75rem] leading-none tracking-[-0.022em]">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-[0.8125rem] leading-relaxed text-muted">{description}</p>
        )}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </header>
  );
}
