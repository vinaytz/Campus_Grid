"use client";
import { useMemo, useState } from "react";
import { api, useResource } from "@/hooks/useApi";
import { Button } from "@/components/ui/Button";
import { Input, Select, Toggle, TagInput, MultiSelect, UnavailabilityInput } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Table, TH, TD, EmptyState } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "./PageHeader";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "number" | "time" | "date" | "select" | "email" | "toggle" | "tags" | "multiselect" | "unavailability";
  options?: { value: string; label: string }[];
  /** tags only: one-click suggestions. The field still accepts anything typed. */
  suggestions?: readonly string[];
  hint?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string | number | boolean | string[];
  full?: boolean;
  /** Hide this field unless the form's current values satisfy the predicate. */
  showIf?: (values: Record<string, any>) => boolean;
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
  const [deleting, setDeleting] = useState<T | null>(null);
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
      blank[f.name] = f.defaultValue
        ?? (f.type === "toggle" ? true : f.type === "tags" || f.type === "multiselect" ? [] : "");
    }
    setFormError(null);
    setEditing(blank as Partial<T>);
  }

  function openEdit(row: T) {
    const next: Record<string, unknown> = {};
    for (const f of fields) {
      const v = (row as any)[f.name];
      if (f.type === "tags") {
        next[f.name] = Array.isArray(v) ? v : [];
      } else if (f.type === "multiselect") {
        // Populated refs arrive as objects; the form works in ids.
        next[f.name] = Array.isArray(v)
          ? v.map((x: any) => (x && typeof x === "object" && "_id" in x ? String(x._id) : String(x)))
          : [];
      } else {
        next[f.name] = v && typeof v === "object" && "_id" in v ? v._id : v ?? "";
      }
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
    try {
      await api(`/api/admin/${config.resource}/${row._id}`, { method: "DELETE" });
      push(`${config.singular} deleted.`);
      setDeleting(null);
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
                    <Button size="xs" variant="ghost" className="hover:text-claret" onClick={() => setDeleting(row)}>
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
            const values = (editing ?? {}) as Record<string, any>;
            if (f.showIf && !f.showIf(values)) return null;

            const value = values[f.name];
            const set = (v: unknown) => setEditing((p) => ({ ...(p as object), [f.name]: v }) as Partial<T>);
            const wrap = f.full ? "sm:col-span-2" : "";

            if (f.type === "toggle") {
              return (
                <div key={f.name} className={wrap}>
                  <Toggle label={f.label} description={f.hint} checked={!!value} onChange={set} />
                </div>
              );
            }
            if (f.type === "tags") {
              return (
                <div key={f.name} className={wrap}>
                  <TagInput label={f.label} hint={f.hint} suggestions={f.suggestions}
                    placeholder={f.placeholder}
                    value={Array.isArray(value) ? value : []} onChange={set} />
                </div>
              );
            }
            if (f.type === "multiselect") {
              return (
                <div key={f.name} className={wrap}>
                  <MultiSelect label={f.label} value={Array.isArray(value) ? value : []}
                    onChange={set} options={f.options ?? []} emptyHint={f.placeholder} />
                </div>
              );
            }
            if (f.type === "unavailability") {
              return (
                <UnavailabilityInput key={f.name} label={f.label}
                  value={Array.isArray(value) ? value as { day: number; slotOrder: number }[] : []}
                  onChange={set}
                  slots={f.options ?? []} />
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
                  onChange={(e) => set(e.target.value)}
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
      <Modal open={!!deleting} onClose={() => setDeleting(null)}
        title={`Delete ${config.singular.toLowerCase()}?`}
        description="This cannot be undone. Records still used by assignments will be protected.">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => deleting && remove(deleting)}>Delete</Button>
        </div>
      </Modal>
    </>
  );
}
