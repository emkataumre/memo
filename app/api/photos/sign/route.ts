import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

const STORAGE_BUCKET = "photos";
const SIGNED_TTL_SECONDS = 3600;
const MAX_IDS = 100;

export interface SignSuccess {
  thumb_url: string;
  full_url: string;
  expires_at: number; // ms since epoch
}

export interface SignFailure {
  error: "locked" | "missing" | "sign_failed";
}

export type SignResult = SignSuccess | SignFailure;

interface PhotoRow {
  id: string;
  storage_path: string;
  reveal_at: string;
}

function thumbPathFor(fullPath: string): string {
  // foo/bar/abc.webp → foo/bar/abc_thumb.webp
  // Extension-agnostic so historical .jpg uploads still resolve.
  const dot = fullPath.lastIndexOf(".");
  if (dot < 0) return `${fullPath}_thumb`;
  return `${fullPath.slice(0, dot)}_thumb${fullPath.slice(dot)}`;
}

export async function POST(req: Request) {
  let body: { ids?: unknown };
  try {
    body = (await req.json()) as { ids?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }
  if (body.ids.length > MAX_IDS) {
    return NextResponse.json(
      { error: `at most ${MAX_IDS} ids per request` },
      { status: 400 },
    );
  }
  const ids = body.ids.filter((v): v is string => typeof v === "string");
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids must be strings" }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  const { data: rows, error } = await supabase
    .from("photos")
    .select("id, storage_path, reveal_at")
    .in("id", ids);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rowsById = new Map<string, PhotoRow>(
    (rows ?? []).map((r) => [r.id, r as PhotoRow]),
  );
  const now = Date.now();
  const expiresAt = now + SIGNED_TTL_SECONDS * 1000;

  const entries = await Promise.all(
    ids.map(async (id): Promise<[string, SignResult]> => {
      const row = rowsById.get(id);
      if (!row) return [id, { error: "missing" }];
      if (Date.parse(row.reveal_at) > now) return [id, { error: "locked" }];

      const thumbPath = thumbPathFor(row.storage_path);
      const [thumbRes, fullRes] = await Promise.all([
        supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(thumbPath, SIGNED_TTL_SECONDS),
        supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(row.storage_path, SIGNED_TTL_SECONDS),
      ]);

      const thumbUrl = thumbRes.data?.signedUrl ?? null;
      const fullUrl = fullRes.data?.signedUrl ?? null;
      if (!thumbUrl || !fullUrl) return [id, { error: "sign_failed" }];

      return [
        id,
        { thumb_url: thumbUrl, full_url: fullUrl, expires_at: expiresAt },
      ];
    }),
  );

  return NextResponse.json(
    { urls: Object.fromEntries(entries) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
