import { connectAndRegister } from "@/lib/db";
import { getTenantAdmin, resetUniversityData } from "@/lib/tenant";
import { ok, fail, handleError } from "@/lib/api";

/** Deletes all of the signed-in admin's university data except periods and rules. */
export async function POST(req: Request) {
  try {
    const { universityId } = await getTenantAdmin();
    const body = await req.json().catch(() => null);
    if (body?.confirm !== "DELETE") return fail('Type DELETE to confirm.', 400);
    await connectAndRegister();
    return ok(await resetUniversityData(universityId));
  } catch (e) {
    return handleError(e);
  }
}
