import { NextResponse } from "next/server";
import { broadcast, type PushPayload } from "@/lib/push/server";

// Internal trigger called by a cron service at ~21:00 Europe/Copenhagen.
// The proxy passes this route through (PUBLIC_PATHS) because a cron
// caller has no passphrase cookie; the PUSH_TRIGGER_SECRET header is
// the actual gate. Mint that secret server-side, give the value to
// your cron service, and have it POST here with X-Trigger-Secret set.
//
// Body (optional): { title, body, url, tag }. Defaults provided if absent.

const DEFAULT_PAYLOAD: PushPayload = {
  title: "memo · reveal time",
  body: "today's roll is unlocking.",
  url: "/canvas",
  tag: "memo-reveal",
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: Request) {
  const expected = process.env.PUSH_TRIGGER_SECRET;
  if (!expected || expected.length < 16) {
    return NextResponse.json(
      { error: "PUSH_TRIGGER_SECRET not configured" },
      { status: 500 },
    );
  }
  const provided = req.headers.get("x-trigger-secret") ?? "";
  if (!timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: PushPayload = DEFAULT_PAYLOAD;
  try {
    const body = (await req.json().catch(() => null)) as PushPayload | null;
    if (body && typeof body.title === "string" && typeof body.body === "string") {
      payload = {
        title: body.title,
        body: body.body,
        url: typeof body.url === "string" ? body.url : DEFAULT_PAYLOAD.url,
        tag: typeof body.tag === "string" ? body.tag : DEFAULT_PAYLOAD.tag,
      };
    }
  } catch {
    /* keep default */
  }

  try {
    const result = await broadcast(payload);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
