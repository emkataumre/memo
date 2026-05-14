"use client";

import { useEffect, useRef, useState } from "react";
import { useSelf } from "@/lib/self/useSelf";
import type { Song, SpotifyTrack } from "@/lib/types";

interface Props {
  todaysSong: Song | null;
  onClose: () => void;
  onPicked: (track: SpotifyTrack) => void;
}

export default function SongPicker({ todaysSong, onClose, onPicked }: Props) {
  const self = useSelf();
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (abortRef.current) abortRef.current.abort();

    const q = query.trim();
    if (!q) {
      // Empty query: skip work. Render side filters results by `q`.
      return;
    }

    debounce.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/spotify/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? `status ${res.status}`);
        }
        const data = (await res.json()) as { tracks: SpotifyTrack[] };
        setTracks(data.tracks ?? []);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "search failed");
        setTracks([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  const hasQuery = query.trim().length > 0;

  async function pick(track: SpotifyTrack) {
    setSubmitting(track.id);
    try {
      onPicked(track);
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/45 z-[180] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="w-full sm:max-w-md bg-paper border-2 border-ink shadow-[12px_12px_0_var(--ink)] flex flex-col max-h-[92vh]">
        <header className="bg-ink text-paper px-3 py-1.5 flex items-center justify-between font-pixel text-xs tracking-widest uppercase">
          <span className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-coral"></span>
            pesen na denq
          </span>
          <button
            onClick={onClose}
            aria-label="Zatvori"
            className="w-5 h-5 border-2 border-paper flex items-center justify-center text-[10px] cursor-pointer active:bg-paper active:text-ink"
          >
            ✕
          </button>
        </header>

        {todaysSong ? (
          <div className="px-4 pt-4 pb-6">
            <div className="p-3 border-2 border-ink bg-paper-deep flex items-center gap-3 mb-4">
              {todaysSong.album_art_url ? (
                <img
                  src={todaysSong.album_art_url}
                  alt=""
                  className="w-16 h-16 object-cover border border-ink flex-shrink-0"
                />
              ) : (
                <div className="w-16 h-16 bg-ink/10 border border-ink flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-pixel text-[9px] tracking-widest uppercase text-coral">
                  dneshniqt izbor · zaklucheno
                </div>
                <div className="font-mono text-sm truncate mt-0.5">
                  {todaysSong.track_name}
                </div>
                <div className="font-mono text-xs text-ink-soft truncate">
                  {todaysSong.artist_name}
                </div>
              </div>
            </div>
            <p className="font-mono text-xs text-ink-soft text-center leading-relaxed">
              edna pesen na den. <br />
              moje pak utre v 21:00.
            </p>
          </div>
        ) : (
          <div className="px-4 pt-4 pb-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="nameri v spotify…"
              autoFocus
              disabled={!self}
              className="w-full border-2 border-ink bg-white px-3 py-2.5 font-mono text-base focus:outline-none"
            />

            {hasQuery && loading && (
              <div className="mt-2 font-pixel text-[10px] tracking-widest uppercase text-ink-soft">
                tursene
              </div>
            )}
            {hasQuery && error && (
              <div className="mt-2 font-pixel text-[10px] tracking-widest uppercase text-coral">
                {error}
              </div>
            )}
          </div>
        )}

        {!todaysSong && (
          <div className="overflow-y-auto px-2 pb-4 flex-1">
            {hasQuery &&
              tracks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => pick(t)}
                  disabled={submitting !== null}
                  className="w-full flex items-center gap-3 p-2 border-2 border-ink mb-2 bg-paper active:translate-x-[2px] active:translate-y-[2px] cursor-pointer disabled:opacity-50 text-left"
                >
                  {t.albumArt ? (
                    <img
                      src={t.albumArt}
                      alt=""
                      className="w-12 h-12 object-cover border border-ink flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-ink/10 border border-ink flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm truncate">{t.name}</div>
                    <div className="font-mono text-xs text-ink-soft truncate">
                      {t.artist}
                    </div>
                  </div>
                  {submitting === t.id ? (
                    <span className="font-pixel text-[10px] tracking-widest uppercase text-coral">
                      …
                    </span>
                  ) : (
                    <span className="font-pixel text-[10px] tracking-widest uppercase text-ink-soft">
                      izberi
                    </span>
                  )}
                </button>
              ))}
            {hasQuery && !loading && !error && tracks.length === 0 && (
              <div className="text-center font-pixel text-[10px] tracking-widest uppercase text-ink-soft py-6">
                nqma rezultati
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
