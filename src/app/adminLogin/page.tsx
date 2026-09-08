"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "@/hooks/useApi";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      await api("/api/auth/login", {
        method: "POST",
        json: { email, password, surface: "platform" },
      });
      router.push("/adminDashboard");
    }
    catch (err) { setError((err as Error).message); setLoading(false); }
  }
  return (
    <main className="min-h-dvh bg-ground px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto grid min-h-[calc(100dvh-2.5rem)] max-w-6xl overflow-hidden rounded-[24px] border border-line bg-surface shadow-lift lg:grid-cols-[1.05fr_.95fr]">
        <section className="relative hidden overflow-hidden bg-ink p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-24 -top-24 size-72 rounded-full border border-moss/30" />
          <div className="absolute -bottom-28 -left-16 size-80 rounded-full border border-ochre/25" />
          <div className="relative">
            <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-ink"><Sparkles className="size-4" /></span>
              Campus Grid
            </div>
            <p className="mt-20 max-w-md font-sans text-5xl font-semibold leading-[.98] tracking-[-.06em]">
              The calm control room for every campus.
            </p>
            <p className="mt-6 max-w-sm text-sm leading-6 text-white/65">
              Manage institutions, provision university administrators, and keep every timetable workspace isolated and ready.
            </p>
          </div>
          <div className="relative flex items-center gap-3 text-xs text-white/55">
            <ShieldCheck className="size-4 text-moss" /> Platform-level access · protected workspace
          </div>
        </section>
        <section className="flex items-center justify-center p-6 sm:p-10 lg:p-14">
          <form onSubmit={submit} className="w-full max-w-md">
            <div className="mb-10">
              <Link href="/login" className="mb-8 inline-flex items-center gap-2 text-xs font-semibold text-muted transition-colors hover:text-ink">
                <ArrowRight className="size-3 rotate-180" /> University admin login
              </Link>
              <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-ink text-accent shadow-lift">
                <LockKeyhole className="size-5" />
              </div>
              <p className="eyebrow text-ochre">Platform administration</p>
              <h1 className="mt-3 font-sans text-3xl font-semibold tracking-[-.045em] text-ink sm:text-4xl">Welcome back.</h1>
              <p className="mt-3 max-w-sm text-sm leading-6 text-muted">Sign in to manage your universities and their administrator access.</p>
            </div>
            <div className="space-y-5">
              <Input label="Platform email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="owner@platform.com" />
              <Input label="Password" type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" />
            </div>
            {error && <p role="alert" className="mt-4 rounded-md border border-ochre/40 bg-ochre/10 px-3 py-2.5 text-sm text-ink">{error}</p>}
            <Button type="submit" loading={loading} variant="dark" className="mt-7 h-11 w-full justify-between px-4">
              Continue to control room <ArrowRight className="size-4" />
            </Button>
            <p className="mt-6 text-center text-xs text-muted">Restricted to the platform owner.</p>
          </form>
        </section>
      </div>
    </main>
  );
}
