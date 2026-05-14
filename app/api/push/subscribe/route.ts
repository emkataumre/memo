import { NextResponse } from "next/server";
import { saveSubscription } from "@/lib/push/server";
import type { Author } from "@/lib/types";

// The proxy gates this route on the passphrase cookie. The body carries
// the active author (matches the value used elsewhere for note/photo/song
// writes) and the browser-issued PushSubscription.
interface Body {
  author?: Author;
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
}

function isAuthor(v: unknown): v is Author {
  return v === "emo" || v === "magi";
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const author = body.author;
  const sub = body.subscription;
  if (!isAuthor(author) || !sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }
  try {
    await saveSubscription({
      author,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
