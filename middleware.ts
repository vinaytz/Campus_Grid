import { NextResponse, type NextRequest } from "next/server";
import { readToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/constants";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await readToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/dashboard") && !session) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/dashboard") && session?.role === "PLATFORM_ADMIN") {
    return NextResponse.redirect(new URL("/adminDashboard", req.url));
  }
  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL(
      session.role === "PLATFORM_ADMIN" ? "/adminDashboard" : "/dashboard",
      req.url
    ));
  }
  if (pathname.startsWith("/adminDashboard") && (!session || session.role !== "PLATFORM_ADMIN")) {
    return NextResponse.redirect(new URL("/adminLogin", req.url));
  }
  if (pathname === "/adminLogin" && session?.role === "PLATFORM_ADMIN") {
    return NextResponse.redirect(new URL("/adminDashboard", req.url));
  }
  if (pathname === "/adminLogin" && session && session.role !== "PLATFORM_ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/login", "/adminDashboard/:path*", "/adminLogin"] };
