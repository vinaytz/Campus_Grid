import { connectAndRegister } from "@/lib/db";
import { getResource } from "@/lib/resources";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, handleError, parseBody } from "@/lib/api";
import TimeSlot from "@/models/TimeSlot";

type Ctx = { params: Promise<{ resource: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    await connectAndRegister();
    const { resource } = await params;
    const def = getResource(resource);

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();

    const filter: Record<string, unknown> = {};
    if (q && def.search?.length) {
      filter.$or = def.search.map((f) => ({ [f]: { $regex: q, $options: "i" } }));
    }

    let query = def.model.find(filter).sort(def.sort);
    for (const p of def.populate ?? []) query = query.populate(p);

    return ok(await query.lean());
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    await connectAndRegister();
    const { resource } = await params;
    const def = getResource(resource);

    const body = await parseBody(req, def.schema);
    if (resource === "slots") {
      const existing = await TimeSlot.find().lean();
      const start = Number(body.start.replace(":", ""));
      const end = Number(body.end.replace(":", ""));
      const overlap = existing.find((slot) => {
        const a = Number(slot.start.replace(":", ""));
        const b = Number(slot.end.replace(":", ""));
        return start < b && end > a;
      });
      if (overlap) return fail(`Period overlaps with ${overlap.start}–${overlap.end}.`, 409);
    }
    const created = await def.model.create(body);
    return ok(created.toObject(), 201);
  } catch (e) {
    return handleError(e);
  }
}
