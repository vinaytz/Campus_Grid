"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/hooks/useApi";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null);
    try { await api("/api/auth/login", { method: "POST", json: { email, password } }); router.push("/adminDashboard"); }
    catch (err) { setError((err as Error).message); setLoading(false); }
  }
  return <main className="flex min-h-dvh items-center justify-center bg-ground px-5">
    <form onSubmit={submit} className="w-full max-w-sm space-y-4">
      <h1 className="font-display text-2xl">Platform administration</h1>
      <Input label="Email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
      <Input label="Password" type="password" required value={password} onChange={e => setPassword(e.target.value)} />
      {error && <p role="alert" className="text-sm text-claret">{error}</p>}
      <Button type="submit" loading={loading} className="w-full">Sign in</Button>
    </form>
  </main>;
}
