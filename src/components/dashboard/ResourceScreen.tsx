"use client";
import { useMemo, useState } from "react";
import { api, useResource } from "@/hooks/useApi";
import { Button } from "@/components/ui/Button";
import { Input, Select, Toggle } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Table, TH, TD, EmptyState } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "./PageHeader";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "number" | "time" | "select" | "email" | "toggle";
  options?: { value: string; label: string }[];
  hint?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string | number | boolean;
  full?: boolean;
};

export type ColumnDef<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
};

export type ScreenConfig<T> = {
  resource: string;
  title: string;
  eyebrow: string;
  description: string;
  singular: string;
  searchable?: boolean;
  columns: ColumnDef<T>[];
  fields: FieldDef[] | ((options: Record<string, any[]>) => FieldDef[]);
  /** Extra endpoints this screen needs to build its dropdowns. */
  lookups?: Record<string, string>;
  emptyHint: string;
};

export function ResourceScreen<T extends { _id: string }>({ config }: { config: ScreenConfig<T> }) {
  const { push } = useToast();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Partial<T> | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const listUrl = `/api/admin/${config.resource}${q ? `?q=${encodeURIComponent(q)}` : ""}`;
  const { data, loading, reload } = useResource<T[]>(listUrl);

  // Lookups feed the select fields (e.g. sections list on the assignments form).
  const lookupEntries = Object.entries(config.lookups ?? {});
  const lookupA = useResource<any[]>(lookupEntries[0]?.[1] ?? null);
  const lookupB = useResource<any[]>(lookupEntries[1]?.[1] ?? null);
  const lookupC = useResource<any[]>(lookupEntries[2]?.[1] ?? null);
  const lookupD = useResource<any[]>(lookupEntries[3]?.[1] ?? null);

  const lookups = useMemo(() => {
    const raw = [lookupA.data, lookupB.data, lookupC.data, lookupD.data];
    return Object.fromEntries(lookupEntries.map(([key], i) => [key, raw[i] ?? []]));
  }, [lookupA.data, lookupB.data, lookupC.data, lookupD.data]); // eslint-disable-line

  const fields = typeof config.fields === "function" ? config.fields(lookups) : config.fields;

  function openNew() {
    const blank: Record<string, unknown> = {};
    for (const f of fields) {
      blank[f.name] = f.defaultValue ?? (f.type === "toggle" ? true : "");
    }
    setFormError(null);
    setEditing(blank as Partial<T>);
  }

  function openEdit(row: T) {
    const next: Record<string, unknown> = {};
    for (const f of fields) {
      const v = (row as any)[f.name];
      next[f.name] = v && typeof v === "object" && "_id" in v ? v._id : v ?? "";
    }
    setFormError(null);
    setEditing({ ...(next as Partial<T>), _id: row._id });
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setFormError(null);
    const id = (editing as any)._id;
    const payload = { ...editing } as Record<string, unknown>;
    delete payload._id;

    try {
      await api(`/api/admin/${config.resource}${id ? `/${id}` : ""}`, {
        method: id ? "PUT" : "POST",
        json: payload,
      });
      push(id ? `${config.singular} updated.` : `${config.singular} added.`);
      setEditing(null);
      await reload();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: T) {
    if (!confirm(`Delete this ${config.singular.toLowerCase()}? This can't be undone.`)) return;
    try {
      await api(`/api/admin/${config.resource}/${row._id}`, { method: "DELETE" });
      push(`${config.singular} deleted.`);
      await reload();
    } catch (e) {
      push((e as Error).message, "error");
    }
  }

  const rows = data ?? [];

  return (
    <>
      <PageHeader
        eyebrow={config.eyebrow}
        title={config.title}
        description={config.description}
        action={<Button variant="primary" size="sm" onClick={openNew}><Plus className="size-3.5" /> Add {config.singular.toLowerCase()}</Button>}
      />

      {config.searchable !== false && (
        <div className="mb-3 flex items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${config.title.toLowerCase()}`}
            className="h-9 w-full max-w-xs rounded border border-rule-strong/70 bg-sheet px-2.5 text-sm transition-colors placeholder:text-muted/55 hover:border-graphite-400 focus:border-claret"
          />
          <span className="whitespace-nowrap font-mono text-micro text-muted">
            {loading ? "…" : `${rows.length} record${rows.length === 1 ? "" : "s"}`}
          </span>
        </div>
      )}

      {rows.length === 0 && !loading ? (
        <div className="rounded border border-rule bg-white">
          <EmptyState
            title={q ? "No matches" : `No ${config.title.toLowerCase()} yet`}
            hint={q ? "Try a different search term." : config.emptyHint}
            action={!q ? <Button variant="primary" size="sm" onClick={openNew}>Add {config.singular.toLowerCase()}</Button> : undefined}
          />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              {config.columns.map((c) => <TH key={c.header} className={c.className}>{c.header}</TH>)}
              <TH className="w-24 text-right">Actions</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row._id} className="hover:bg-ink/[.02]">
                {config.columns.map((c) => (
                  <TD key={c.header} className={c.className}>{c.cell(row)}</TD>
                ))}
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="xs" variant="ghost" onClick={() => openEdit(row)}>Edit</Button>
                    <Button size="xs" variant="ghost" className="hover:text-claret" onClick={() => remove(row)}>
                      Delete
                    </Button>
                  </div>
                </TD>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={(editing as any)?._id ? `Edit ${config.singular.toLowerCase()}` : `Add ${config.singular.toLowerCase()}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>Save</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((f) => {
            const value = (editing as any)?.[f.name];
            const set = (v: unknown) => setEditing((p) => ({ ...(p as object), [f.name]: v }) as Partial<T>);
            const wrap = f.full ? "sm:col-span-2" : "";

            if (f.type === "toggle") {
              return (
                <div key={f.name} className={wrap}>
                  <Toggle label={f.label} description={f.hint} checked={!!value} onChange={set} />
                </div>
              );
            }
            if (f.type === "select") {
              return (
                <div key={f.name} className={wrap}>
                  <Select label={f.label} hint={f.hint} value={value ?? ""}
                    onChange={(e) => set(e.target.value)}>
                    <option value="">{f.placeholder ?? "Choose one"}</option>
                    {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </div>
              );
            }
            return (
              <div key={f.name} className={wrap}>
                <Input
                  label={f.label} hint={f.hint} type={f.type ?? "text"}
                  placeholder={f.placeholder} required={f.required}
                  value={value ?? ""}
                  onChange={(e) => set(f.type === "number" ? e.target.value : e.target.value)}
                />
              </div>
            );
          })}
        </div>
        {formError && (
          <p role="alert" className="mt-4 rounded border border-claret-line bg-claret-soft px-3 py-2 text-[0.8125rem] text-claret">
            {formError}
          </p>
        )}
      </Modal>
    </>
  );
}
