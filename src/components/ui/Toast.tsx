"use client";
import { Toaster, toast } from "sonner";
import type { ReactNode } from "react";

/** Kept as a provider so existing `useToast()` call sites carry over unchanged. */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="bottom-right"
        gap={8}
        toastOptions={{
          classNames: {
            toast:
              "!rounded-md !border !border-graphite-700 !bg-graphite-900 !text-white !shadow-lift !font-sans !text-[0.8125rem] !px-3.5 !py-2.5",
            error: "!bg-claret !border-claret-hover",
            success: "!bg-graphite-900",
          },
        }}
      />
    </>
  );
}

export function useToast() {
  return {
    push: (message: string, tone: "ok" | "error" = "ok") =>
      tone === "error" ? toast.error(message) : toast.success(message),
  };
}
