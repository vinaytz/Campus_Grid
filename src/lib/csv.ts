/**
 * A small, dependency-free CSV reader.
 *
 * Handles the parts of RFC 4180 that real spreadsheet exports actually use:
 * quoted fields, embedded commas and newlines, doubled quotes as an escape, and
 * both CRLF and LF line endings. Also tolerates a UTF-8 BOM, which Excel adds.
 *
 * Not a general CSV library — it exists so bulk import doesn't pull in a
 * dependency for something this bounded.
 */

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  let sawAnyChar = false;

  const endField = () => { row.push(field); field = ""; };
  const endRow = () => {
    endField();
    // Skip rows that are entirely empty (trailing newline at end of file).
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const c = src[i];

    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }

    if (c === '"' && field === "") { inQuotes = true; sawAnyChar = true; i++; continue; }
    if (c === ",") { endField(); i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { endRow(); i++; continue; }
    field += c; sawAnyChar = true; i++;
  }

  if (field !== "" || row.length > 0) endRow();
  return sawAnyChar || rows.length ? rows : [];
}

/** Normalises a header cell: "Required Sessions" → "requiredsessions". */
function normaliseHeader(h: string) {
  return h.trim().toLowerCase().replace(/[\s_\-.]+/g, "");
}

/**
 * Parses CSV into objects keyed by a canonical field name.
 *
 * `aliases` maps canonical name → the header spellings accepted for it, so an
 * admin's "Room No" and "room_number" both land on `code`.
 */
export function parseRows(
  text: string,
  aliases: Record<string, string[]>
): { rows: Record<string, string>[]; headers: string[]; unknown: string[] } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], headers: [], unknown: [] };

  const lookup = new Map<string, string>();
  for (const [canonical, spellings] of Object.entries(aliases)) {
    lookup.set(normaliseHeader(canonical), canonical);
    for (const s of spellings) lookup.set(normaliseHeader(s), canonical);
  }

  const rawHeaders = table[0].map((h) => h.trim());
  const mapped = rawHeaders.map((h) => lookup.get(normaliseHeader(h)) ?? null);
  const unknown = rawHeaders.filter((_, i) => mapped[i] === null).filter((h) => h.length > 0);

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < table.length; r++) {
    const line = table[r];
    if (line.every((c) => c.trim() === "")) continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < mapped.length; c++) {
      const key = mapped[c];
      if (!key) continue;
      obj[key] = (line[c] ?? "").trim();
    }
    rows.push(obj);
  }

  return { rows, headers: rawHeaders, unknown };
}

/** Renders rows back to CSV — used to hand the admin a blank template. */
export function toCsv(headers: string[], rows: (string | number)[][] = []): string {
  const cell = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n");
}
