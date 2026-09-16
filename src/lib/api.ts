import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";

export function ok<T>(data: T, init?: number) {
  return NextResponse.json({ ok: true, data }, { status: init ?? 200 });
}

export function fail(message: string, status = 400, extra?: unknown) {
  return NextResponse.json({ ok: false, error: message, extra }, { status });
}

/** Single place where every thrown error becomes a clean HTTP response. */
export function handleError(e: unknown) {
  if (e instanceof ZodError) {
    const first = e.errors[0];
    return fail(`${first.path.join(".") || "Input"}: ${first.message}`, 422, e.flatten());
  }
  const err = e as Error & { status?: number; code?: number; keyValue?: object };
  if (err?.code === 11000) return fail(duplicateMessage(err), 409);
  if (err?.status) return fail(err.message, err.status);
  console.error("[api]", err);
  return fail("Something went wrong on our end. Try again.", 500);
}

/** Names the clashing value; bulk uploads carry it only in the driver's message text. */
function duplicateMessage(err: Error & { keyValue?: object }) {
  const pairs = err.keyValue
    ? Object.entries(err.keyValue).map(([k, v]) => [k, String(v)])
    : [...String(err.message).matchAll(/(\w+): "([^"]*)"/g)].map((m) => [m[1], m[2]]);
  const shown = pairs.filter(([k]) => k !== "universityId");
  if (shown.length === 0) return "That value is already in use.";
  return `${shown.map(([k, v]) => `${k} "${v}"`).join(" + ")} is already in use.`;
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  const json = await req.json().catch(() => ({}));
  return schema.parse(json);
}
