import { NextResponse } from "next/server";
import { mintRealtimeJwt } from "@/lib/session/jwt";

// The proxy gates this route on the passphrase cookie. By the time we run
// here, the caller has already authenticated. We just mint a fresh JWT.
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
