"use client";
import { useEffect, useState } from "react";
import { api } from "@/hooks/useApi";

type University = { _id: string; name: string; code: string; active: boolean };
export default function AdminDashboardPage() {
  const [items, setItems] = useState<University[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<University[]>("/api/platform/universities").then(setItems).catch(e => setError(e.message)); }, []);
  async function toggle(item: University) {
    const updated = await api<University>(`/api/platform/universities/${item._id}`, { method: "PATCH", json: { active: !item.active } });
    setItems(current => current.map(x => x._id === updated._id ? updated : x));
  }
  return <main className="mx-auto max-w-4xl p-8"><h1 className="font-display text-3xl">Universities</h1>
    {error && <p role="alert" className="mt-4 text-claret">{error}</p>}
    <div className="mt-6 divide-y border-y">{items.map(item => <div key={item._id} className="flex items-center justify-between py-4">
      <div><strong>{item.name}</strong><span className="ml-3 font-mono text-xs text-muted">{item.code}</span></div>
      <button className="text-sm underline" onClick={() => toggle(item)}>{item.active ? "Deactivate" : "Activate"}</button>
    </div>)}</div>
  </main>;
}
