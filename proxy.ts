import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session/cookie";

const PUBLIC_PATHS = [
  "/passphrase",
  "/api/session",
  // Cron-triggered: authenticated by PUSH_TRIGGER_SECRET header, not cookie.
  "/api/push/send",
  "/manifest.json",
  "/manifest.webmanifest",
  "/icon",
  "/icon1",
  "/apple-icon",
];

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (
    PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/")) ||
    path.startsWith("/_next/") ||
    path.startsWith("/icons/") ||
    path === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const valid = await verifySessionToken(token);

  if (!valid) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/passphrase", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/).*)"],
};
