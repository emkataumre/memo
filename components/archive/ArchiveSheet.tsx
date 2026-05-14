"use client";

import { useMemo, useState } from "react";
import type { Author, Note, Photo, Song } from "@/lib/types";
import { memoDay } from "@/lib/memo-day";
import { isLocked } from "@/lib/photos/derive";
import { usePhotoUrl, usePhotoUrlPrefetch } from "@/lib/photos/usePhotoUrls";

interface Props {
  notes: Note[];
  photos: Photo[];
  songs: Song[];
  onViewPhoto: (photo: Photo) => void;
  onClose: () => void;
}

type Tab = "photos" | "songs";
type Filter = "all" | Author;

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

function formatMemoDay(d: string): string {
  const parts = d.split("-").map(Number);
  return `${MONTHS[parts[1] - 1]} ${parts[2]}`;
}

function dayLabel(d: string): string {
  const today = memoDay();
  if (d === today) return "TODAY";
  return formatMemoDay(d);
}

export default function ArchiveSheet({
  notes,
  photos,
  songs,
  onViewPhoto,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>("photos");
  const [filter, setFilter] = useState<Filter>("all");

  const revealedPhotos = useMemo(
    () => photos.filter((p) => !isLocked(p)),
    [photos],
  );
  usePhotoUrlPrefetch(revealedPhotos.map((p) => p.id));

  // Group photos by memo-day (derived from taken_at)
  const photoGroups = useMemo(() => {
    const map = new Map<string, Photo[]>();
    for (const p of revealedPhotos) {
      if (filter !== "all" && p.author !== filter) continue;
      const day = memoDay(new Date(p.taken_at));
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [revealedPhotos, filter]);

  // Group songs by memo_day
  const songGroups = useMemo(() => {
    const map = new Map<string, Song[]>();
    for (const s of songs) {
      if (filter !== "all" && s.author !== filter) continue;
      if (!map.has(s.memo_day)) map.set(s.memo_day, []);
      map.get(s.memo_day)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [songs, filter]);

  const filteredPhotoCount = revealedPhotos.filter(
    (p) => filter === "all" || p.author === filter,
  ).length;
  const filteredSongCount = songs.filter(
    (s) => filter === "all" || s.author === filter,
  ).length;
  const totalDays = new Set([
    ...revealedPhotos.map((p) => memoDay(new Date(p.taken_at))),
    ...songs.map((s) => s.memo_day),
    ...notes.map((n) => memoDay(new Date(n.created_at))),
  ]).size;

  return (
    <div className="fixed inset-0 z-[160] bg-paper overflow-auto">
      <header className="sticky top-0 h-11 bg-ink text-paper flex items-center justify-between px-4 z-10 border-b-2 border-ink font-pixel text-xs tracking-widest uppercase">
        <span className="font-display text-2xl text-coral leading-none normal-case tracking-normal">
          memo
        </span>
        <span className="opacity-65 hidden sm:inline">archive</span>
        <button
          onClick={onClose}
          className="border-2 border-paper px-2.5 py-1 active:bg-paper active:text-ink cursor-pointer"
        >
          back
        </button>
      </header>

      <div className="max-w-3xl mx-auto px-5 pt-10 pb-6">
        <h1 className="font-display text-6xl sm:text-7xl leading-none">
          the archive<span className="text-coral">.</span>
        </h1>
        <div className="mt-5 font-pixel text-[11px] tracking-widest uppercase text-ink-soft">
          <span className="text-ink">{revealedPhotos.length}</span> photos
          <span className="text-coral mx-2">·</span>
          <span className="text-ink">{songs.length}</span> songs
          <span className="text-coral mx-2">·</span>
          <span className="text-ink">{totalDays}</span> days
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-3xl mx-auto px-5 flex items-center gap-3 flex-wrap mb-5">
        <div className="inline-flex border-2 border-ink shadow-[3px_3px_0_var(--ink)]">
          <TabBtn
            active={tab === "photos"}
            onClick={() => setTab("photos")}
            label="PHOTOS"
            count={filteredPhotoCount}
          />
          <TabBtn
            active={tab === "songs"}
            onClick={() => setTab("songs")}
            label="SONGS"
            count={filteredSongCount}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            ALL
          </FilterChip>
          <FilterChip
            active={filter === "emo"}
            onClick={() => setFilter("emo")}
          >
            EMO
          </FilterChip>
          <FilterChip
            active={filter === "magi"}
            onClick={() => setFilter("magi")}
          >
            MAGI
          </FilterChip>
        </div>
      </div>

      {tab === "photos" ? (
        <PhotosView groups={photoGroups} onViewPhoto={onViewPhoto} />
      ) : (
        <SongsView groups={songGroups} />
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`font-pixel text-[11px] tracking-widest uppercase px-3 py-2 flex items-center gap-2 cursor-pointer border-l-2 border-ink first:border-l-0 ${
        active ? "bg-ink text-paper" : "bg-paper text-ink-soft"
      }`}
    >
      {label}
      <span
        className={`text-[10px] px-1.5 py-0 border ${
          active
            ? "bg-coral text-ink border-ink"
            : "bg-paper-deep border-ink-soft"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`font-pixel text-[10px] tracking-widest uppercase px-2 py-1.5 border-2 border-ink cursor-pointer ${
        active ? "bg-ink text-paper" : "bg-paper"
      }`}
    >
      {children}
    </button>
  );
}

function PhotosView({
  groups,
  onViewPhoto,
}: {
  groups: [string, Photo[]][];
  onViewPhoto: (photo: Photo) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-12 text-center font-pixel text-xs tracking-widest uppercase text-ink-soft">
        no photos yet.
      </div>
    );
  }
  return (
    <div className="max-w-3xl mx-auto px-5 pb-32 space-y-8">
      {groups.map(([day, items]) => (
        <section key={day}>
          <DayHeader day={day} count={items.length} />
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-4">
            {items.map((p) => (
              <PhotoTile key={p.id} photo={p} onView={onViewPhoto} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SongsView({ groups }: { groups: [string, Song[]][] }) {
  if (groups.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-12 text-center font-pixel text-xs tracking-widest uppercase text-ink-soft">
        no songs yet.
      </div>
    );
  }
  return (
    <div className="max-w-3xl mx-auto px-5 pb-32 space-y-8">
      {groups.map(([day, items]) => (
        <section key={day}>
          <DayHeader day={day} count={items.length} />
          <div className="space-y-2.5 mt-4">
            {items.map((s) => (
              <SongRow key={s.id} song={s} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function DayHeader({ day, count }: { day: string; count: number }) {
  const isToday = day === memoDay();
  return (
    <div className="flex items-baseline justify-between border-b-2 border-ink pb-2">
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-3xl leading-none relative">
          {formatMemoDay(day).toLowerCase()}
          {isToday && (
            <span className="absolute -bottom-1 left-0 right-0 h-1 bg-coral" />
          )}
        </h2>
        <span
          className={`font-pixel text-[10px] tracking-widest uppercase ${
            isToday ? "text-coral" : "text-ink-soft"
          }`}
        >
          {dayLabel(day)}
        </span>
      </div>
      <span className="font-pixel text-[10px] tracking-widest uppercase text-ink-soft">
        {count} {count === 1 ? "item" : "items"}
      </span>
    </div>
  );
}

function PhotoTile({
  photo,
  onView,
}: {
  photo: Photo;
  onView: (p: Photo) => void;
}) {
  const urls = usePhotoUrl(photo.id);
  return (
    <button
      onClick={() => onView(photo)}
      className="bg-white border-2 border-ink shadow-[3px_3px_0_var(--ink)] p-1.5 pb-5 relative active:translate-x-[2px] active:translate-y-[2px] active:shadow-none cursor-pointer"
    >
      <div
        className="w-full aspect-square bg-ink/10"
        style={{
          backgroundImage: urls?.thumb_url
            ? `url(${urls.thumb_url})`
            : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="absolute bottom-0.5 left-1.5 right-1.5 flex justify-between font-pixel text-[8px] tracking-widest uppercase text-ink-soft">
        <span className="text-ink">{photo.author}</span>
        <span>{photo.taken_at.slice(11, 16)}</span>
      </div>
    </button>
  );
}

function SongRow({ song }: { song: Song }) {
  return (
    <a
      href={`https://open.spotify.com/track/${song.spotify_track_id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-2 border-2 border-ink bg-paper-deep cursor-pointer active:translate-x-[2px] active:translate-y-[2px]"
    >
      {song.album_art_url ? (
        <img
          src={song.album_art_url}
          alt=""
          className="w-14 h-14 object-cover border border-ink flex-shrink-0"
        />
      ) : (
        <div className="w-14 h-14 bg-ink/10 border border-ink flex-shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="font-pixel text-[9px] tracking-widest uppercase text-coral">
          from {song.author}
        </div>
        <div className="font-mono text-sm truncate">{song.track_name}</div>
        <div className="font-mono text-xs text-ink-soft truncate">
          {song.artist_name}
        </div>
      </div>
    </a>
  );
}
