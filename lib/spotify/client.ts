import "server-only";
import type { SpotifyTrack } from "@/lib/types";

interface CachedToken {
  access_token: string;
  expires_at: number;
}

let cached: CachedToken | null = null;

async function fetchToken(): Promise<string> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET required");
  }
  const basic = btoa(`${id}:${secret}`);
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`spotify token request failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cached = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cached.access_token;
}

async function getToken(): Promise<string> {
  if (cached && cached.expires_at > Date.now()) return cached.access_token;
  return await fetchToken();
}

interface SpotifyImage {
  url: string;
  height?: number;
  width?: number;
}
interface SpotifyArtist {
  name: string;
}
interface SpotifyAlbum {
  images?: SpotifyImage[];
}
interface SpotifyApiTrack {
  id: string;
  name: string;
  artists?: SpotifyArtist[];
  album?: SpotifyAlbum;
}
interface SpotifySearchResponse {
  tracks?: {
    items?: SpotifyApiTrack[];
  };
}

function pickAlbumArt(images?: SpotifyImage[]): string | null {
  if (!images || images.length === 0) return null;
  // Sorted largest first by Spotify. Prefer the middle one (~300px) for speed.
  return (
    images.find((i) => i.width && i.width >= 200 && i.width <= 400)?.url ??
    images[images.length - 1]?.url ??
    null
  );
}

export async function searchTracks(query: string): Promise<SpotifyTrack[]> {
  const q = query.trim();
  if (!q) return [];

  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(
    q,
  )}&type=track&limit=10`;

  let token = await getToken();
  let res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  // Refresh once if token was invalidated.
  if (res.status === 401) {
    cached = null;
    token = await getToken();
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  }
  if (!res.ok) {
    throw new Error(`spotify search failed: ${res.status}`);
  }
  const data = (await res.json()) as SpotifySearchResponse;
  return (data.tracks?.items ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    artist: (t.artists ?? []).map((a) => a.name).join(", "),
    albumArt: pickAlbumArt(t.album?.images),
  }));
}
