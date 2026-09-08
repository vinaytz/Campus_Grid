"use client";

import { useEffect, useState } from "react";

const RECOVERY_KEY = "Campus Grid:chunk-recovery";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    const isChunkFailure =
      /ChunkLoadError|Loading chunk|Failed to load chunk|webpack/i.test(
        `${window.location.href} ${error.message} ${document.body.textContent}`
      );
    if (isChunkFailure && sessionStorage.getItem(RECOVERY_KEY) !== "1") {
      sessionStorage.setItem(RECOVERY_KEY, "1");
      setRecovering(true);
      window.location.reload();
    }
  }, [error.message]);

  function retry() {
    sessionStorage.removeItem(RECOVERY_KEY);
    reset();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-ground px-5">
      <section className="w-full max-w-md rounded-lg border border-line bg-surface p-6">
        <h1 className="font-sans text-xl">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">
          {recovering
            ? "The application was updated. Reloading the latest version…"
            : "Please try again. If the problem persists, refresh the page."}
        </p>
        {!recovering && (
          <button
            type="button"
            onClick={retry}
            className="mt-5 rounded-md bg-ink px-4 py-2 text-sm text-white"
          >
            Try again
          </button>
        )}
      </section>
    </main>
  );
}
