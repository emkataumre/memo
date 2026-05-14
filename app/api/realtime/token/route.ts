import { NextResponse } from "next/server";
import { mintRealtimeJwt } from "@/lib/session/jwt";

// Runs at the edge: handler is a pure Web Crypto HS256 sign with no DB
// access, so a regional POP execution skips ~50-100ms of Node cold-start
// versus the default serverless runtime. The proxy (also edge) gates
// this route on the passphrase cookie, so by the time we run here the
// caller has already authenticated.
export const runtime = "edge";

export async function GET() {
  try {
    const { token, expiresAt } = await mintRealtimeJwt();
    return NextResponse.json(
      { token, expiresAt },
      {
        headers: {
          // JWTs are short-lived secrets; never let any cache hold them.
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
