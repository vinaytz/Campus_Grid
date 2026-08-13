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
  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue ?? {})[0] ?? "value";
    return fail(`That ${field} is already in use.`, 409);
  }
  if (err?.status) return fail(err.message, err.status);
  console.error("[api]", err);
  return fail("Something went wrong on our end. Try again.", 500);
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  const json = await req.json().catch(() => ({}));
  return schema.parse(json);
}
