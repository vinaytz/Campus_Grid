"use client";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "dark";
  size?: "xs" | "sm" | "md";
  loading?: boolean;
};

const VARIANTS = {
  primary:
    "bg-claret text-white shadow-hair hover:bg-claret-hover active:translate-y-px",
  secondary:
    "bg-white text-ink border border-rule-strong/70 hover:border-graphite-400 hover:bg-white active:translate-y-px",
  dark: "bg-graphite-900 text-white hover:bg-graphite-800 active:translate-y-px",
  ghost: "text-muted hover:text-ink hover:bg-ink/[.045]",
  danger: "bg-white text-claret border border-claret-line hover:bg-claret-soft",
};

const SIZES = {
  xs: "h-7 px-2 text-micro gap-1.5",
  sm: "h-8 px-2.5 text-[0.8125rem] gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, ...rest }, ref
) {
  return (
    <button
      ref={ref}
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap rounded font-medium",
        "transition-all duration-150 ease-physical",
        "disabled:pointer-events-none disabled:opacity-40",
        SIZES[size], VARIANTS[variant], className
      )}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
});
