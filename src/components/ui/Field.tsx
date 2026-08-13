"use client";
import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";

const control =
  "w-full rounded border border-rule-strong/70 bg-white text-sm text-ink " +
  "transition-colors placeholder:text-muted/50 hover:border-graphite-400 " +
  "focus:border-claret disabled:bg-ground/60 disabled:text-muted";

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
      <input {...rest} className={cn(control, "h-9 px-2.5", error && "border-claret", className)} />
      {error && <p className="mt-1 text-micro text-claret">{error}</p>}
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
      className="flex w-full items-center justify-between gap-4 rounded border border-rule-strong/70 bg-white px-3 py-2.5 text-left transition-colors hover:border-graphite-400"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-micro leading-snug text-muted">{description}</span>}
      </span>
      <span className={cn(
        "relative h-[18px] w-8 shrink-0 rounded-full transition-colors duration-200",
        checked ? "bg-moss" : "bg-graphite-400/35"
      )}>
        <span className={cn(
          "absolute top-[2px] size-3.5 rounded-full bg-white shadow-hair transition-all duration-200 ease-physical",
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
