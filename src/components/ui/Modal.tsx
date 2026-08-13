"use client";
import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Modal({
  open, onClose, title, description, children, footer, wide,
}: {
  open: boolean; onClose: () => void; title: string; description?: string;
  children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-graphite-950/40 backdrop-blur-[3px]"
            onClick={onClose}
          />
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            initial={{ opacity: 0, y: 8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.995 }}
            transition={{ duration: 0.2, ease: [0.2, 0.9, 0.3, 1] }}
            className={cn(
              "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-lg bg-sheet shadow-lift sm:rounded-lg",
              wide ? "sm:max-w-3xl" : "sm:max-w-md"
            )}
          >
            <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
              <div>
                <h2 className="font-display text-lg leading-tight tracking-[-0.01em]">{title}</h2>
                {description && <p className="mt-1 text-[0.8125rem] leading-snug text-muted">{description}</p>}
              </div>
              <button onClick={onClose} aria-label="Close"
                className="-mr-1 -mt-1 rounded p-1 text-muted transition-colors hover:bg-ink/5 hover:text-ink">
                <X className="size-4" />
              </button>
            </header>
            <div className="thin-scroll flex-1 overflow-y-auto px-5 py-5">{children}</div>
            {footer && (
              <footer className="flex items-center justify-end gap-2 border-t border-rule bg-ground/40 px-5 py-3">
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
