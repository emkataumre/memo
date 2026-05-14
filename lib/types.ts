export type Author = "emo" | "magi";
export type NoteColor = "lemon" | "pink" | "sky" | "mint";
export type NoteVariant =
  | "classic"
  | "strip"
  | "grain"
  | "tape"
  | "quote";

export interface Note {
  id: string;
  author: Author;
  body: string;
  color: NoteColor;
  x: number;
  y: number;
  rotation: number;
  // Optional explicit size in canvas-space pixels. Null = client default
  // (currently 208 × 128). See StickyNote + migration 0004.
  width: number | null;
  height: number | null;
  // Visual treatment chosen at creation. Null = legacy row → render
  // as classic.
  variant: NoteVariant | null;
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
  // When non-null, the photo is bound to a date idea — reveals
  // immediately, never pinned on canvas, never in tonight's reveal sheet.
  // See migration 0007.
  date_idea_id: string | null;
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

export type DateIdeaStatus = "in_jar" | "pending" | "taken" | "completed";

export interface DateIdea {
  id: string;
  author: Author;
  body: string;
  status: DateIdeaStatus;
  // Legacy fields kept for back-compat with rows created before the
  // dates rework (migration 0007). New flow uses pending → completed.
  taken_at: string | null;
  taken_note_id: string | null;
  // New flow fields. Populated only when status = 'completed'.
  event_at: string | null;
  caption: string | null;
  completed_at: string | null;
  created_at: string;
}

// Public shape of the jar — in-jar counts plus the single pending date
// entity if one exists. Pending bodies are intentionally returned (the
// user already drew it; hiding the body would be useless).
export interface JarState {
  count: number;
  byAuthor: Record<Author, number>;
  pending: DateIdea | null;
}
