import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { makeSessionToken, SESSION_COOKIE } from "@/lib/session/cookie";

export async function POST(req: Request) {
  let body: { passphrase?: unknown };
  try {
    body = (await req.json()) as { passphrase?: unknown };
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const expected = process.env.MEMO_PASSPHRASE;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "server misconfigured: MEMO_PASSPHRASE missing" },
      { status: 500 },
    );
  }

  if (typeof body.passphrase !== "string" || body.passphrase !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const token = await makeSessionToken();
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
