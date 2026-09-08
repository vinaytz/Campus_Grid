"use client";
import { useCallback, useEffect, useState } from "react";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; extra?: unknown };
export type ReloadOptions = { preserveData?: boolean };

export async function api<T = unknown>(
  url: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: { "Content-Type": "application/json", ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const payload = (await res.json().catch(() => null)) as ApiResult<T> | null;
  if (!res.ok || !payload || payload.ok === false) {
    throw new Error(payload && "error" in payload ? payload.error : "Request failed.");
  }
  return payload.data;
}

/** Fetch + refetch for a single endpoint. */
export function useResource<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async ({ preserveData = false }: ReloadOptions = {}) => {
    if (!url) return;
    if (!preserveData) setLoading(true);
    setError(null);
    try {
      setData(await api<T>(url));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (!preserveData) setLoading(false);
    }
  }, [url]);

  useEffect(() => { void reload(); }, [reload]);

  return { data, loading, error, reload, setData };
}
