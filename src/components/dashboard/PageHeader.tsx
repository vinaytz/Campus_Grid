import type { ReactNode } from "react";

export function PageHeader({
  eyebrow, title, description, action,
}: { eyebrow?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-5 border-b border-rule/80 pb-5">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="font-sans text-xl font-medium leading-tight tracking-tight sm:text-2xl text-ink">{title}</h1>
        {description && (
          <p className="mt-2.5 max-w-2xl text-[0.875rem] leading-relaxed text-muted">{description}</p>
        )}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </header>
  );
}
