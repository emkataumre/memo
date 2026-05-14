import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Photo, Song } from "@/lib/types";

const STORAGE_BUCKET = "photos";
const SIGNED_TTL_SECONDS = 3600;
const REFRESH_LEEWAY_MS = 5 * 60 * 1000; // refresh URLs 5 min before they expire

interface CachedUrls {
  thumbUrl: string;
  fullUrl: string;
  expiresAt: number;
}

// Module-scope cache so a server instance reuses signed URLs across polls
// instead of minting fresh tokens every 3 s (which caused image flicker).
const urlCache = new Map<string, CachedUrls>();

interface PhotoRow {
  id: string;
  author: string;
  storage_path: string;
  taken_at: string;
  reveal_at: string;
  caption: string | null;
  pinned_x: number | null;
  pinned_y: number | null;
  pinned_rotation: number;
  pinned_at: string | null;
}

function thumbPathFor(fullPath: string): string {
  // foo/bar/abc.jpg → foo/bar/abc_thumb.jpg
  const dot = fullPath.lastIndexOf(".");
  if (dot < 0) return `${fullPath}_thumb`;
  return `${fullPath.slice(0, dot)}_thumb${fullPath.slice(dot)}`;
}

/**
 * Delta polling endpoint. Returns:
 *  - notes whose `updated_at > since`
 *  - all photos (small volume; locked = no urls, revealed = signed urls)
 *
 * Photos query is intentionally unfiltered for MVP — low row count.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const since = url.searchParams.get("since");

  const supabase = getSupabaseServer();

  let notesQuery = supabase
    .from("notes")
    .select("*")
    .order("updated_at", { ascending: true });
  if (since && !Number.isNaN(Date.parse(since))) {
    notesQuery = notesQuery.gt("updated_at", since);
  }
  const { data: notes, error: notesErr } = await notesQuery;
  if (notesErr)
    return NextResponse.json({ error: notesErr.message }, { status: 500 });

  const { data: photoRows, error: photosErr } = await supabase
    .from("photos")
    .select("*")
    .order("taken_at", { ascending: true });
  if (photosErr)
    return NextResponse.json({ error: photosErr.message }, { status: 500 });

  const now = Date.now();
  const photos: Photo[] = await Promise.all(
    (photoRows ?? []).map(async (row: PhotoRow): Promise<Photo> => {
      const revealed = Date.parse(row.reveal_at) <= now;
      if (!revealed) {
        return {
          id: row.id,
          author: row.author as Photo["author"],
          taken_at: row.taken_at,
          reveal_at: row.reveal_at,
          caption: row.caption,
          locked: true,
          thumb_url: null,
          full_url: null,
          pinned_x: row.pinned_x,
          pinned_y: row.pinned_y,
          pinned_rotation: row.pinned_rotation ?? 0,
          pinned_at: row.pinned_at,
        };
      }

      const cached = urlCache.get(row.id);
      let thumbUrl: string | null;
      let fullUrl: string | null;
      if (cached && cached.expiresAt > Date.now() + REFRESH_LEEWAY_MS) {
        thumbUrl = cached.thumbUrl;
        fullUrl = cached.fullUrl;
      } else {
        const thumbPath = thumbPathFor(row.storage_path);
        const [thumbRes, fullRes] = await Promise.all([
          supabase.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(thumbPath, SIGNED_TTL_SECONDS),
          supabase.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(row.storage_path, SIGNED_TTL_SECONDS),
        ]);
        thumbUrl = thumbRes.data?.signedUrl ?? null;
        fullUrl = fullRes.data?.signedUrl ?? null;
        if (thumbUrl && fullUrl) {
          urlCache.set(row.id, {
            thumbUrl,
            fullUrl,
            expiresAt: Date.now() + SIGNED_TTL_SECONDS * 1000,
          });
        }
      }

      return {
        id: row.id,
        author: row.author as Photo["author"],
        taken_at: row.taken_at,
        reveal_at: row.reveal_at,
        caption: row.caption,
        locked: false,
        thumb_url: thumbUrl,
        full_url: fullUrl,
        pinned_x: row.pinned_x,
        pinned_y: row.pinned_y,
        pinned_rotation: row.pinned_rotation ?? 0,
        pinned_at: row.pinned_at,
      };
    }),
  );

  const { data: songRows, error: songsErr } = await supabase
    .from("songs")
    .select("*")
    .order("memo_day", { ascending: true });
  if (songsErr)
    return NextResponse.json({ error: songsErr.message }, { status: 500 });

  const songs: Song[] = (songRows ?? []).map((row) => ({
    id: row.id,
    author: row.author,
    memo_day: row.memo_day,
    spotify_track_id: row.spotify_track_id,
    track_name: row.track_name,
    artist_name: row.artist_name,
    album_art_url: row.album_art_url,
    created_at: row.created_at,
    pinned_x: row.pinned_x,
    pinned_y: row.pinned_y,
    pinned_rotation: row.pinned_rotation ?? 0,
    pinned_at: row.pinned_at,
  }));

  return NextResponse.json({
    notes: notes ?? [],
    photos,
    songs,
    serverTime: new Date().toISOString(),
  });
}
