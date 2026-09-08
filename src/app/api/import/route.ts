import { connectAndRegister } from "@/lib/db";
import { requireUniversityAdmin } from "@/lib/auth";
import { previewImport, commitImport, templateFor, type ImportResource } from "@/lib/import";
import { importCommitSchema } from "@/lib/validators";
import { ok, fail, handleError, parseBody } from "@/lib/api";

const RESOURCES = ["rooms", "faculty", "subjects", "sections", "assignments"] as const;

function resourceFrom(value: string | null): ImportResource {
  if (!value || !RESOURCES.includes(value as ImportResource)) {
    const e = new Error(
      `Choose one of: ${RESOURCES.join(", ")}.`
    ) as Error & { status?: number };
    e.status = 400;
    throw e;
  }
  return value as ImportResource;
}

/** Hands back a blank CSV template with example rows. */
export async function GET(req: Request) {
  try {
    await requireUniversityAdmin();
    const { searchParams } = new URL(req.url);
    const resource = resourceFrom(searchParams.get("resource"));

    return new Response(templateFor(resource), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${resource}-template.csv"`,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}

/**
 * Dry run. Parses and validates the upload and returns a preview.
 * Writes nothing — the admin confirms with PUT.
 */
export async function POST(req: Request) {
  try {
    const session = await requireUniversityAdmin();
    await connectAndRegister();
    const { searchParams } = new URL(req.url);
    const resource = resourceFrom(searchParams.get("resource"));

    const contentType = req.headers.get("content-type") ?? "";
    const form = contentType.startsWith("multipart/form-data")
      ? await req.formData()
      : null;
    let text: string;

    if (form) {
      const file = form.get("file");
      if (!(file instanceof File)) return fail("Attach a .csv file.", 400);
      if (file.size > 2_000_000) return fail("That file is larger than 2 MB. Split it up.", 413);
      text = await file.text();
    } else {
      const body = await req.json().catch(() => null);
      if (!body?.text) return fail("Attach a .csv file, or send its contents as { text }.", 400);
      text = String(body.text);
    }

    const preview = await previewImport(resource, text, session.universityId ?? undefined);
    return ok(preview);
  } catch (e) {
    return handleError(e);
  }
}

/** Commits a previewed batch, all or nothing. */
export async function PUT(req: Request) {
  try {
    const session = await requireUniversityAdmin();
    await connectAndRegister();
    const body = await parseBody(req, importCommitSchema);
    const result = await commitImport(body.resource, body.rows as Record<string, unknown>[], session.universityId ?? undefined);
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
