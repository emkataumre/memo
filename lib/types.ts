export type Author = "emo" | "magi";
export type NoteColor = "lemon" | "pink" | "sky" | "mint";

export interface Note {
  id: string;
  author: Author;
  body: string;
  color: NoteColor;
  x: number;
  y: number;
  rotation: number;
  created_at: string;
  updated_at: string;
}

// Photo row as it lives in the DB. The client derives `locked` from
// `reveal_at` (see lib/photos/derive.ts) and resolves signed URLs on
// demand via the sign-cache (see lib/photos/sign-cache.ts). The raw
// `storage_path` is harmless without a signed URL — the bucket is
// private.
export interface Photo {
  id: string;
  author: Author;
  storage_path: string;
  taken_at: string;
  reveal_at: string;
  caption: string | null;
  pinned_x: number | null;
  pinned_y: number | null;
  pinned_rotation: number;
  pinned_at: string | null;
}

export interface Song {
  id: string;
  author: Author;
  memo_day: string; // YYYY-MM-DD
  spotify_track_id: string;
  track_name: string;
  artist_name: string;
  album_art_url: string | null;
  created_at: string;
  pinned_x: number | null;
  pinned_y: number | null;
  pinned_rotation: number;
  pinned_at: string | null;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
  albumArt: string | null;
}

export interface DateIdea {
  id: string;
  author: Author;
  body: string;
  status: "in_jar" | "taken";
  taken_at: string | null;
  taken_note_id: string | null;
  created_at: string;
}

// Public shape of the jar — counts only, idea bodies never sent unless drawn.
export interface JarState {
  count: number;
  byAuthor: Record<Author, number>;
}
