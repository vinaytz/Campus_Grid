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
  primary: "bg-accent text-white hover:bg-accent/90 active:translate-y-px",
  secondary: "bg-surface text-ink border border-line/70 hover:border-accent/50 hover:bg-surface/95 active:translate-y-px",
  dark: "bg-ink text-white hover:brightness-[0.95] active:translate-y-px",
  ghost: "text-muted hover:text-ink hover:bg-ink/[.045]",
  danger: "bg-surface text-ink border border-line/70 hover:bg-surface/95",
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
        "inline-flex select-none items-center justify-center whitespace-nowrap rounded-md font-semibold",
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
