import { connectAndRegister } from "@/lib/db";
import University from "@/models/University";
import User from "@/models/User";
import { requirePlatformAdmin, hashPassword } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";

export async function GET() {
  try {
    await requirePlatformAdmin();
    await connectAndRegister();
    return ok(await University.find().sort({ name: 1 }).lean());
  } catch (e) { return handleError(e); }
}

export async function POST(req: Request) {
  try {
    await requirePlatformAdmin();
    await connectAndRegister();
    const body = await req.json() as { name?: string; code?: string; adminName?: string; adminEmail?: string; adminPassword?: string };
    if (!body.name || !body.code || !body.adminName || !body.adminEmail || !body.adminPassword) {
      return fail("University name, code and administrator details are required.", 400);
    }
    const university = await University.create({ name: body.name, code: body.code });
    try {
      await User.create({
        name: body.adminName,
        email: body.adminEmail.toLowerCase(),
        passwordHash: await hashPassword(body.adminPassword),
        role: "UNIVERSITY_ADMIN",
        universityId: university._id,
      });
    } catch (error) {
      await University.findByIdAndDelete(university._id);
      throw error;
    }
    return ok(university.toObject(), 201);
  } catch (e) { return handleError(e); }
}
