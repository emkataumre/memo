import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { memoDay } from "@/lib/memo-day";
import type { Author } from "@/lib/types";

const VALID_AUTHORS: Author[] = ["emo", "magi"];

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const author = body.author;
  const spotify_track_id = body.spotify_track_id;
  const track_name = body.track_name;
  const artist_name = body.artist_name;
  const album_art_url =
    typeof body.album_art_url === "string" ? body.album_art_url : null;
  const pinRaw = body.pin as
    | { x?: unknown; y?: unknown; rotation?: unknown }
    | undefined;

  if (
    typeof author !== "string" ||
    !VALID_AUTHORS.includes(author as Author) ||
    typeof spotify_track_id !== "string" ||
    spotify_track_id.length === 0 ||
    spotify_track_id.length > 64 ||
    typeof track_name !== "string" ||
    track_name.length === 0 ||
    track_name.length > 500 ||
    typeof artist_name !== "string" ||
    artist_name.length === 0 ||
    artist_name.length > 500
  ) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const pin =
    pinRaw &&
    typeof pinRaw.x === "number" &&
    Number.isFinite(pinRaw.x) &&
    typeof pinRaw.y === "number" &&
    Number.isFinite(pinRaw.y)
      ? {
          x: pinRaw.x,
          y: pinRaw.y,
          rotation:
            typeof pinRaw.rotation === "number" &&
            Number.isFinite(pinRaw.rotation)
              ? pinRaw.rotation
              : 0,
        }
      : null;

  const today = memoDay();
  const supabase = getSupabaseServer();

  // Check for an existing pick for this author / memo-day (unique index)
  const { data: existing, error: selErr } = await supabase
    .from("songs")
    .select("id")
    .eq("author", author)
    .eq("memo_day", today)
    .maybeSingle();

  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }

  const trackFields = {
    spotify_track_id,
    track_name,
    artist_name,
    album_art_url,
  };
  const pinFields = pin
    ? {
        pinned_x: pin.x,
        pinned_y: pin.y,
        pinned_rotation: pin.rotation,
        pinned_at: new Date().toISOString(),
      }
    : {};

  if (existing) {
    return NextResponse.json(
      { error: "today's song is already picked" },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("songs")
    .insert({ author, ...trackFields, ...pinFields })
    .select()
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ song: data });
}
