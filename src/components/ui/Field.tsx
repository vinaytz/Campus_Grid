"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";

const control =
  "w-full rounded-sm border border-line/70 bg-surface text-sm text-ink transition-all placeholder:text-muted/50 " +
  "hover:border-accent/50 focus:border-accent focus:ring-4 focus:ring-accent/10 disabled:bg-canvas/60 disabled:text-muted";

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between gap-3">
      <span className="label">{children}</span>
      {hint && <span className="text-micro text-muted">{hint}</span>}
    </span>
  );
}

export function Input({
  label, hint, error, className, ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: ReactNode; error?: string }) {
  return (
    <label className="block">
      {label && <Label hint={hint}>{label}</Label>}
      <input {...rest} className={cn(control, "h-9 px-2.5", error && "border-accent", className)} />
      {error && <p className="mt-1 text-micro text-accent">{error}</p>}
    </label>
  );
}

export function Select({
  label, hint, children, className, ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: ReactNode }) {
  return (
    <label className="block">
      {label && <Label hint={hint}>{label}</Label>}
      <select
        {...rest}
        className={cn(control, "h-9 appearance-none bg-no-repeat pl-2.5 pr-8", className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2.5 4.5L6 8L9.5 4.5' stroke='%235C6270' stroke-width='1.4' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
          backgroundPosition: "right 9px center",
        }}
      >
        {children}
      </select>
    </label>
  );
}

export function Toggle({
  label, checked, onChange, description,
}: { label: string; checked: boolean; onChange: (v: boolean) => void; description?: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-sm border border-line/70 bg-surface px-3.5 py-3 text-left transition-colors hover:border-accent/50"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-micro leading-snug text-muted">{description}</span>}
      </span>
      <span className={cn(
        "relative h-[18px] w-8 shrink-0 rounded-full transition-colors duration-200",
        checked ? "bg-accent" : "bg-ink/30"
      )}>
        <span className={cn(
          "absolute top-[2px] size-3.5 rounded-full bg-white transition-all duration-200 ease-physical",
          checked ? "left-[16px]" : "left-[2px]"
        )} />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({
  value, onChange, options, className,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <div className={cn("inline-flex rounded border border-rule-strong/70 bg-white p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value} type="button" onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "rounded-xs px-2.5 py-1 text-[0.8125rem] font-medium transition-colors duration-150",
            value === o.value ? "bg-graphite-900 text-white" : "text-muted hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Free-form tag entry, backed by a suggestion list.
 *
 * Capabilities are deliberately open — an institution can invent a tag the code
 * has never heard of — so this offers the common ones as one-click chips while
 * still accepting anything typed.
 */
export function TagInput({
  label, hint, value, onChange, suggestions = [], placeholder,
}: {
  label?: string;
  hint?: ReactNode;
  value: string[];
  onChange: (v: string[]) => void;
  suggestions?: readonly string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const current = value ?? [];

  const add = (raw: string) => {
    const tag = raw.trim().toUpperCase();
    if (!tag || current.includes(tag)) { setDraft(""); return; }
    onChange([...current, tag]);
    setDraft("");
  };

  const unused = suggestions.filter((s) => !current.includes(s));

  return (
    <div className="block">
      {label && <Label hint={hint}>{label}</Label>}
      <div className={cn(control, "flex min-h-9 flex-wrap items-center gap-1 p-1")}>
        {current.map((tag) => (
          <span key={tag}
            className="inline-flex items-center gap-1 rounded-xs bg-ink/[.06] px-1.5 py-0.5 font-mono text-[0.68rem]">
            {tag}
            <button type="button" aria-label={`Remove ${tag}`}
              onClick={() => onChange(current.filter((t) => t !== tag))}
              className="text-muted transition-colors hover:text-accent">×</button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); }
            if (e.key === "Backspace" && !draft && current.length) {
              onChange(current.slice(0, -1));
            }
          }}
          onBlur={() => draft && add(draft)}
          placeholder={current.length ? "" : placeholder ?? "Type a tag and press Enter"}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted/50"
        />
      </div>
      {unused.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {unused.map((s) => (
            <button key={s} type="button" onClick={() => add(s)}
              className="rounded-xs border border-rule-strong/60 px-1.5 py-0.5 font-mono text-[0.62rem] text-muted transition-colors hover:border-graphite-400 hover:text-ink">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Checkbox list for picking several records, e.g. a set of permitted rooms. */
export function MultiSelect({
  label, hint, value, onChange, options, emptyHint,
}: {
  label?: string;
  hint?: ReactNode;
  value: string[];
  onChange: (v: string[]) => void;
  options: { value: string; label: string }[];
  emptyHint?: string;
}) {
  const current = value ?? [];
  const toggle = (id: string) =>
    onChange(current.includes(id) ? current.filter((v) => v !== id) : [...current, id]);

  return (
    <div className="block">
      {label && <Label hint={hint ?? `${current.length} selected`}>{label}</Label>}
      <div className="thin-scroll max-h-40 overflow-y-auto rounded border border-rule-strong/70 bg-white">
        {options.length === 0 ? (
          <p className="px-2.5 py-2 text-micro text-muted">{emptyHint ?? "Nothing to choose from yet."}</p>
        ) : (
          options.map((o) => {
            const on = current.includes(o.value);
            return (
              <label key={o.value}
                className="flex cursor-pointer items-center gap-2 border-b border-rule/70 px-2.5 py-1.5 text-[0.8125rem] last:border-b-0 hover:bg-ink/[.02]">
                <input type="checkbox" checked={on} onChange={() => toggle(o.value)}
                  className="size-3.5 accent-accent" />
                <span className={on ? "font-medium" : "text-muted"}>{o.label}</span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
