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

/**
 * Photo as exposed to the client.
 * - `locked: true` (pre-reveal) → `thumb_url` / `full_url` are null. The
 *   client only knows it exists and who took it.
 * - `locked: false` (post-reveal) → signed URLs are present.
 */
export interface Photo {
  id: string;
  author: Author;
  taken_at: string;
  reveal_at: string;
  caption: string | null;
  locked: boolean;
  thumb_url: string | null;
  full_url: string | null;
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
