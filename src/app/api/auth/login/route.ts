import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { createSession, verifyPassword } from "@/lib/auth";
import { loginSchema } from "@/lib/validators";
import { ok, fail, handleError, parseBody } from "@/lib/api";

export async function POST(req: Request) {
  try {
    await connectDB();
    const { email, password } = await parseBody(req, loginSchema);

    const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return fail("That email and password don't match an account.", 401);
    }

    let universityActive = true;
    let universityId = user.universityId ? String(user.universityId) : null;
    if (universityId) {
      const University = (await import("@/models/University")).default;
      const university = await University.findById(universityId).select("active").lean();
      universityActive = !!university?.active;
    }
    if (user.role !== "PLATFORM_ADMIN" && !universityActive) {
      return fail("This university is currently inactive.", 403);
    }
    const session = {
      id: String(user._id), name: user.name, email: user.email,
      role: user.role === "ADMIN" ? "UNIVERSITY_ADMIN" : user.role,
      universityId,
    };
    await createSession(session);
    return ok(session);
  } catch (e) {
    return handleError(e);
  }
}
