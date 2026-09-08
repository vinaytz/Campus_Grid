"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { api } from "@/hooks/useApi";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      await api("/api/auth/login", {
        method: "POST",
        json: { email, password, surface: "university" },
      });
      router.push(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Input label="Email" type="email" autoComplete="email" required autoFocus
        value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@school.edu" />
      <Input label="Password" type="password" autoComplete="current-password" required
        value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      {error && (
        <p role="alert" className="rounded border border-line bg-surface/6 px-3 py-2 text-[0.8125rem] text-accent">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" loading={loading} className="w-full">Sign in</Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Tool chrome, with a faint drawing grid — the surface being signed into */}
      <aside className="chrome relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <span className="relative font-sans text-sm tracking-[-0.01em]">Campus Grid</span>
        <div className="relative max-w-sm">
          <p className="mb-3 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-white/35">
            Timetable administration
          </p>
          <h1 className="font-sans text-2xl leading-tight tracking-tight">
            Build the week on one sheet.
          </h1>
          <p className="mt-4 text-[0.875rem] leading-relaxed text-white/50">
            Drag sessions onto the canvas and it shows you, instantly, every slot
            that can take them. Let the solver finish the rest.
          </p>
        </div>
        <Link href="/"
          className="relative inline-flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-[0.1em] text-white/40 transition-colors hover:text-white">
          <ArrowLeft className="size-3" /> Public board
        </Link>
      </aside>

      <section className="login-grid relative flex items-center justify-center overflow-hidden bg-ground px-5 py-14">
        <div className="relative z-10 w-full max-w-[21rem]">
          <span className="font-sans text-sm tracking-[-0.01em] lg:hidden">Campus Grid</span>
          <div className="relative rounded-lg border border-line bg-surface p-6">
          <h2 className="font-sans text-2xl tracking-[-0.01em]">Sign in</h2>
          <p className="mb-6 mt-2 text-[0.8125rem] text-muted">
            Administrator access to the timetable workbench.
          </p>
          <Suspense fallback={null}><LoginForm /></Suspense>
          </div>
          <p className="mt-6 text-center text-[0.8125rem] text-muted lg:hidden">
            <Link href="/" className="transition-colors hover:text-ink">← Public board</Link>
          </p>
          <p className="mt-4 text-center text-[0.8125rem] text-muted">
            Platform Admin?{" "}
            <Link href="/adminLogin" className="font-medium text-ink underline underline-offset-2">
              Sign in here
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
