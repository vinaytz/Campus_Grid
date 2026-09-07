import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { SESSION_COOKIE } from "./constants";

const configuredSecret = process.env.AUTH_SECRET;
if (process.env.NODE_ENV === "production" && !configuredSecret) {
  throw new Error("AUTH_SECRET must be configured in production.");
}
const secret = new TextEncoder().encode(configuredSecret ?? "dev-only-insecure-secret-change-me");

export type SessionUser = { id: string; name: string; email: string; role: string };

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}
export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret);

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Edge-safe: takes the raw token so middleware can call it too. */
export async function readToken(token?: string): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      id: String(payload.id),
      name: String(payload.name),
      email: String(payload.email),
      role: String(payload.role),
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return readToken(token);
}

/** Throws a 401-shaped error for route handlers. */
export async function requireAdmin() {
  const session = await getSession();
  if (!session) {
    const err = new Error("Sign in to continue.") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  if (session.role !== "ADMIN") {
    const err = new Error("Administrator access is required.") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  return session;
}
