"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowUpRight, Building2, CheckCircle2, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "@/hooks/useApi";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

type University = { _id: string; name: string; code: string; active: boolean };
export default function AdminDashboardPage() {
  const router = useRouter();
  const [items, setItems] = useState<University[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "", code: "", adminName: "", adminEmail: "", adminPassword: "",
  });
  useEffect(() => {
    api<{ role: string } | null>("/api/auth/me")
      .then(user => {
        if (user?.role !== "PLATFORM_ADMIN") {
          router.replace("/dashboard");
          return;
        }
        return api<University[]>("/api/platform/universities").then(setItems);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);
  async function toggle(item: University) {
    const updated = await api<University>(`/api/platform/universities/${item._id}`, { method: "PATCH", json: { active: !item.active } });
    setItems(current => current.map(x => x._id === updated._id ? updated : x));
  }
  async function createUniversity(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setError(null);
    try {
      const created = await api<University>("/api/platform/universities", {
        method: "POST", json: form,
      });
      setItems(current => [...current, created]);
      setForm({ name: "", code: "", adminName: "", adminEmail: "", adminPassword: "" });
      setShowCreate(false);
    } catch (err) {
      setError((err as Error).message);
    } finally { setSaving(false); }
  }
  return (
    <main className="min-h-dvh bg-ground">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
        <header className="relative overflow-hidden rounded-[22px] bg-ink px-6 py-7 text-white shadow-lift sm:px-9 sm:py-9">
          <div className="absolute -right-16 -top-24 size-72 rounded-full border border-moss/25" />
          <div className="absolute -bottom-32 right-32 size-80 rounded-full border border-ochre/20" />
          <div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold tracking-[.14em] text-white/65">
                <span className="flex size-8 items-center justify-center rounded-xl bg-accent text-ink"><Sparkles className="size-4" /></span>
                Campus Grid PLATFORM
              </div>
              <p className="mt-10 text-xs font-semibold uppercase tracking-[.16em] text-moss">Control room</p>
              <h1 className="mt-3 font-sans text-4xl font-semibold tracking-[-.06em] sm:text-5xl">Your universities.</h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/65">
                Create institutions, provision trusted admins, and keep every scheduling workspace beautifully organized.
              </p>
            </div>
            <Button variant="primary" className="h-11 self-start bg-accent px-4 text-ink hover:bg-accent/90 lg:self-auto" onClick={() => setShowCreate(value => !value)}>
              <Plus className="size-4" /> {showCreate ? "Close form" : "Add university"}
            </Button>
          </div>
        </header>

        {error && <p role="alert" className="mt-5 rounded-md border border-ochre/40 bg-ochre/10 px-4 py-3 text-sm text-ink">{error}</p>}

        <section className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between"><span className="eyebrow">Institutions</span><Building2 className="size-4 text-ochre" /></div>
            <p className="mt-4 font-sans text-3xl font-semibold tracking-[-.05em] text-ink">{items.length}</p>
            <p className="mt-1 text-xs text-muted">Tenant workspaces created</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between"><span className="eyebrow">Active now</span><Activity className="size-4 text-moss" /></div>
            <p className="mt-4 font-sans text-3xl font-semibold tracking-[-.05em] text-ink">{items.filter(item => item.active).length}</p>
            <p className="mt-1 text-xs text-muted">Accepting admin access</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between"><span className="eyebrow">Isolation</span><ShieldCheck className="size-4 text-moss" /></div>
            <p className="mt-4 font-sans text-3xl font-semibold tracking-[-.05em] text-ink">100%</p>
            <p className="mt-1 text-xs text-muted">Tenant data separation</p>
          </div>
        </section>

        {showCreate && (
          <form onSubmit={createUniversity} className="mt-5 rounded-2xl border border-ochre/40 bg-surface p-6 shadow-lift sm:p-8">
            <div className="mb-6">
              <p className="eyebrow text-ochre">New institution</p>
              <h2 className="mt-2 font-sans text-2xl font-semibold text-ink">Set up a university admin</h2>
              <p className="mt-1 text-sm text-muted">The admin can sign in immediately at the standard university login.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="University name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Northbridge University" />
              <Input label="University code" required value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="NBU" />
              <Input label="Admin name" required value={form.adminName} onChange={e => setForm({ ...form, adminName: e.target.value })} placeholder="Dr. Aisha Khan" />
              <Input label="Admin email" required type="email" value={form.adminEmail} onChange={e => setForm({ ...form, adminEmail: e.target.value })} placeholder="admin@northbridge.edu" />
              <Input label="Temporary password" required type="password" value={form.adminPassword} onChange={e => setForm({ ...form, adminPassword: e.target.value })} placeholder="Create a secure password" />
            </div>
            <div className="mt-6 flex justify-end">
              <Button type="submit" loading={saving}>Create university</Button>
            </div>
          </form>
        )}

        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between">
            <p className="eyebrow">Institutions · {items.length}</p>
            {items.length > 0 && <span className="inline-flex items-center gap-1.5 text-xs text-muted"><CheckCircle2 className="size-3.5 text-moss" /> Tenant access is isolated</span>}
          </div>
          {loading ? (
            <div className="rounded-2xl border border-line bg-surface px-6 py-16 text-center text-sm text-muted">Loading your platform workspace…</div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ochre/50 bg-surface px-6 py-16 text-center shadow-lift">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-ochre-soft text-ochre text-xl">+</div>
              <h2 className="mt-5 font-sans text-xl font-semibold text-ink">Start with your first university</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
                Your platform is ready. Add an institution and its University Admin to begin building schedules.
              </p>
              <Button className="mt-6" onClick={() => setShowCreate(true)}>Create first university</Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {items.map(item => (
                <article key={item._id} className="group rounded-2xl border border-line bg-surface p-6 shadow-lift transition-all hover:-translate-y-0.5 hover:border-moss/60">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className={`inline-flex rounded-full px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wider ${item.active ? "bg-moss-soft text-moss" : "bg-ochre-soft text-ochre"}`}>
                        {item.active ? "Active" : "Paused"}
                      </span>
                      <h2 className="mt-4 font-sans text-xl font-semibold text-ink">{item.name}</h2>
                      <p className="mt-1 font-mono text-xs tracking-widest text-muted">{item.code}</p>
                    </div>
                    <button className="inline-flex items-center gap-1 text-xs font-semibold text-moss transition-colors hover:text-ink" onClick={() => toggle(item)}>
                      {item.active ? "Deactivate" : "Activate"} <ArrowUpRight className="size-3" />
                    </button>
                  </div>
                  <div className="mt-7 flex items-center justify-between border-t border-line pt-4 text-xs text-muted">
                    <span>Workspace protected</span><ShieldCheck className="size-4 text-moss" />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
