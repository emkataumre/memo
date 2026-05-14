"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePanZoom, zoomAtPoint } from "@/lib/canvas/usePanZoom";
import { lodFromZoom } from "@/lib/canvas/lod";
import { SpatialIndex } from "@/lib/canvas/spatial-index";
import { memoDay, isCurrentMemoDay } from "@/lib/memo-day";
import {
  cacheLoadNotes,
  cachePutNotes,
  cacheReplaceNotes,
  cacheLoadPhotos,
  cacheReplacePhotos,
  cacheLoadSongs,
  cacheReplaceSongs,
} from "@/lib/cache/indexeddb";
import { useSelf } from "@/lib/self/useSelf";
import { useCapture } from "@/lib/camera/useCapture";
import SelfPicker from "@/components/SelfPicker";
import TopBar from "./TopBar";
import TodayAnchor from "./TodayAnchor";
import StickyNote from "./StickyNote";
import NoteComposer from "./NoteComposer";
import PhotoCard from "./PhotoCard";
import PhotoViewer from "./PhotoViewer";
import SongCard from "./SongCard";
import SongPicker from "../song/SongPicker";
import LockedRoll from "../camera/LockedRoll";
import ArchiveSheet from "../archive/ArchiveSheet";
import RevealSheet from "./RevealSheet";
import Fabs from "./Fabs";
import ZoomControls from "./ZoomControls";
import MiniMap from "./MiniMap";
import ZenExit from "./ZenExit";
import ZenZoomBar from "./ZenZoomBar";
import type {
  Note,
  NoteColor,
  Photo,
  Song,
  SpotifyTrack,
} from "@/lib/types";

const COLORS: NoteColor[] = ["lemon", "pink", "sky", "mint"];
const POLL_ACTIVE_MS = 3000;
const POLL_IDLE_MS = 15000;
const IDLE_THRESHOLD_MS = 60000;

function randomColor(): NoteColor {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function randomRotation(): number {
  return (Math.random() - 0.5) * 10;
}

export default function CanvasClient() {
  const self = useSelf();
  const [notes, setNotes] = useState<Note[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [songPickerOpen, setSongPickerOpen] = useState(false);
  const [rollOpen, setRollOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [composing, setComposing] = useState<{
    x: number;
    y: number;
    rotation: number;
    color: NoteColor;
  } | null>(null);
  const [revealOpen, setRevealOpen] = useState(false);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [uploadFlash, setUploadFlash] = useState<string | null>(null);
  const [zen, setZen] = useState(false);

  const viewportRef = useRef<HTMLElement | null>(null);
  const noteDragRef = useRef(false);
  const setCardDrag = useCallback((active: boolean) => {
    noteDragRef.current = active;
  }, []);
  const [vpSize, setVpSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const { viewport, animateTo } = usePanZoom(viewportRef, noteDragRef);

  // Track viewport size for culling math
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function update() {
      if (!el) return;
      const r = el.getBoundingClientRect();
      setVpSize({ width: r.width, height: r.height });
    }
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Cold load + polling for both notes and photos
  const pollRef = useRef<(() => Promise<void>) | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function markActive() {
      lastActivityRef.current = Date.now();
    }

    async function bootstrap() {
      const [cachedNotes, cachedPhotos, cachedSongs] = await Promise.all([
        cacheLoadNotes(),
        cacheLoadPhotos(),
        cacheLoadSongs(),
      ]);
      if (cancelled) return;
      if (cachedNotes.length) setNotes(cachedNotes);
      if (cachedPhotos.length) setPhotos(cachedPhotos);
      if (cachedSongs.length) setSongs(cachedSongs);
      await poll();
    }

    async function poll() {
      if (cancelled) return;
      try {
        const res = await fetch("/api/state");
        if (res.ok) {
          const data = (await res.json()) as {
            notes?: Note[];
            photos?: Photo[];
            songs?: Song[];
          };
          if (data.notes) {
            setNotes(data.notes);
            await cacheReplaceNotes(data.notes);
          }
          if (data.photos) {
            setPhotos(data.photos);
            await cacheReplacePhotos(data.photos);
          }
          if (data.songs) {
            setSongs(data.songs);
            await cacheReplaceSongs(data.songs);
          }
        }
      } catch {
        /* network blip — retry next tick */
      }
      if (!cancelled && !document.hidden) {
        const idleFor = Date.now() - lastActivityRef.current;
        const next = idleFor > IDLE_THRESHOLD_MS ? POLL_IDLE_MS : POLL_ACTIVE_MS;
        timer = setTimeout(poll, next);
      }
    }

    pollRef.current = poll;
    bootstrap();

    function onVisibility() {
      if (!document.hidden && !timer && !cancelled) {
        markActive();
        poll();
      }
    }
    function onActivity() {
      const wasIdle = Date.now() - lastActivityRef.current > IDLE_THRESHOLD_MS;
      markActive();
      // Coming out of idle: poll now instead of waiting up to 15 s.
      if (wasIdle && !timer && !cancelled && !document.hidden) poll();
    }
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("pointerdown", onActivity, { passive: true });
    document.addEventListener("wheel", onActivity, { passive: true });
    document.addEventListener("keydown", onActivity);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerdown", onActivity);
      document.removeEventListener("wheel", onActivity);
      document.removeEventListener("keydown", onActivity);
      pollRef.current = null;
    };
  }, []);

  // Capture (camera) hook — kicks off a poll on success so the locked
  // photo appears in the PendingPill count immediately.
  const capture = useCapture(() => {
    setUploadFlash("locked in.");
    setTimeout(() => setUploadFlash(null), 2500);
    pollRef.current?.();
  });

  // ---- Derived data ----

  const pinnedPhotos = useMemo(
    () => photos.filter((p) => !p.locked && p.pinned_at !== null),
    [photos],
  );

  const pinnedSongs = useMemo(
    () => songs.filter((s) => s.pinned_at !== null),
    [songs],
  );

  const todaysOwnSong = useMemo(() => {
    if (!self) return null;
    const today = memoDay();
    return (
      songs.find((s) => s.author === self && s.memo_day === today) ?? null
    );
  }, [songs, self]);

  const spatialIndex = useMemo(() => {
    const idx = new SpatialIndex<string>(1000);
    for (const n of notes) idx.add(`note:${n.id}`, n.x, n.y);
    for (const p of pinnedPhotos) {
      if (p.pinned_x !== null && p.pinned_y !== null) {
        idx.add(`photo:${p.id}`, p.pinned_x, p.pinned_y);
      }
    }
    for (const s of pinnedSongs) {
      if (s.pinned_x !== null && s.pinned_y !== null) {
        idx.add(`song:${s.id}`, s.pinned_x, s.pinned_y);
      }
    }
    return idx;
  }, [notes, pinnedPhotos, pinnedSongs]);

  const { visibleNotes, visiblePhotos, visibleSongs } = useMemo(() => {
    if (!vpSize)
      return {
        visibleNotes: notes,
        visiblePhotos: pinnedPhotos,
        visibleSongs: pinnedSongs,
      };
    const marginX = vpSize.width * 0.2;
    const marginY = vpSize.height * 0.2;
    const x1 = (-viewport.x - marginX) / viewport.zoom;
    const y1 = (-viewport.y - marginY) / viewport.zoom;
    const x2 = (vpSize.width + marginX - viewport.x) / viewport.zoom;
    const y2 = (vpSize.height + marginY - viewport.y) / viewport.zoom;
    const visibleKeys = new Set(spatialIndex.query(x1, y1, x2, y2));
    return {
      visibleNotes: notes.filter((n) => visibleKeys.has(`note:${n.id}`)),
      visiblePhotos: pinnedPhotos.filter((p) =>
        visibleKeys.has(`photo:${p.id}`),
      ),
      visibleSongs: pinnedSongs.filter((s) => visibleKeys.has(`song:${s.id}`)),
    };
  }, [notes, pinnedPhotos, pinnedSongs, spatialIndex, viewport, vpSize]);

  const tier = lodFromZoom(viewport.zoom);

  const todayCount = useMemo(() => {
    const today = memoDay();
    const noteCount = notes.filter(
      (n) => memoDay(new Date(n.created_at)) === today,
    ).length;
    const photoCount = pinnedPhotos.filter(
      (p) => memoDay(new Date(p.taken_at)) === today,
    ).length;
    const songCount = pinnedSongs.filter((s) => s.memo_day === today).length;
    return noteCount + photoCount + songCount;
  }, [notes, pinnedPhotos, pinnedSongs]);

  // ---- Mutations ----

  const createNote = useCallback(
    async (
      x: number,
      y: number,
      rotation: number,
      body: string,
      color: NoteColor,
    ) => {
      if (!self) return;
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const optimistic: Note = {
        id: tempId,
        author: self,
        body,
        color,
        x,
        y,
        rotation,
        created_at: now,
        updated_at: now,
      };
      setNotes((prev) => [...prev, optimistic]);

      try {
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ author: self, body, color, x, y, rotation }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { note: Note };
        setNotes((prev) =>
          prev.map((n) => (n.id === tempId ? data.note : n)),
        );
        await cachePutNotes([data.note]);
      } catch {
        setNotes((prev) => prev.filter((n) => n.id !== tempId));
      }
    },
    [self],
  );

  const moveNote = useCallback(async (id: string, x: number, y: number) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, x, y, updated_at: new Date().toISOString() } : n,
      ),
    );
    if (id.startsWith("temp-")) return;
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x, y }),
      });
      if (res.ok) {
        const data = (await res.json()) as { note: Note };
        await cachePutNotes([data.note]);
      }
    } catch {
      /* reconcile on next poll */
    }
  }, []);

  const movePhoto = useCallback(
    async (id: string, x: number, y: number) => {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, pinned_x: x, pinned_y: y } : p,
        ),
      );
      try {
        await fetch(`/api/photos/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned_x: x, pinned_y: y }),
        });
      } catch {
        /* reconcile on next poll */
      }
    },
    [],
  );

  const moveSong = useCallback(async (id: string, x: number, y: number) => {
    setSongs((prev) =>
      prev.map((s) => (s.id === id ? { ...s, pinned_x: x, pinned_y: y } : s)),
    );
    try {
      await fetch(`/api/songs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned_x: x, pinned_y: y }),
      });
    } catch {
      /* reconcile next poll */
    }
  }, []);

  const pickSong = useCallback(
    async (track: SpotifyTrack) => {
      if (!self) return;
      const rect = viewportRef.current?.getBoundingClientRect();
      const cx = rect
        ? (rect.width / 2 - viewport.x) / viewport.zoom
        : 0;
      const cy = rect
        ? (rect.height / 2 - viewport.y) / viewport.zoom
        : 0;
      const rotation = randomRotation();
      try {
        const res = await fetch("/api/songs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            author: self,
            spotify_track_id: track.id,
            track_name: track.name,
            artist_name: track.artist,
            album_art_url: track.albumArt,
            pin: { x: cx, y: cy, rotation },
          }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { song: Song };
        setSongs((prev) => {
          const without = prev.filter((s) => s.id !== data.song.id);
          return [...without, data.song];
        });
      } catch {
        /* reconcile next poll */
      }
      setSongPickerOpen(false);
    },
    [self, viewport],
  );

  const pinPhoto = useCallback(
    async (photo: Photo) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Reuse last known position if it exists (came from a prior pin);
      // otherwise drop at the current viewport center with a fresh rotation.
      const hasPrior =
        photo.pinned_x !== null && photo.pinned_y !== null;
      const cx = hasPrior
        ? (photo.pinned_x as number)
        : (rect.width / 2 - viewport.x) / viewport.zoom;
      const cy = hasPrior
        ? (photo.pinned_y as number)
        : (rect.height / 2 - viewport.y) / viewport.zoom;
      const rotation = hasPrior ? photo.pinned_rotation : randomRotation();

      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photo.id
            ? {
                ...p,
                pinned_x: cx,
                pinned_y: cy,
                pinned_rotation: rotation,
                pinned_at: new Date().toISOString(),
              }
            : p,
        ),
      );
      try {
        await fetch(`/api/photos/${photo.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pin: true,
            pinned_x: cx,
            pinned_y: cy,
            pinned_rotation: rotation,
          }),
        });
      } catch {
        /* reconcile on next poll */
      }
    },
    [viewport],
  );

  const unpinPhoto = useCallback(async (photo: Photo) => {
    // Keep coords so a re-pin restores position; only clear pinned_at.
    setPhotos((prev) =>
      prev.map((p) => (p.id === photo.id ? { ...p, pinned_at: null } : p)),
    );
    try {
      await fetch(`/api/photos/${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: false }),
      });
    } catch {
      /* reconcile on next poll */
    }
  }, []);

  // ---- UI callbacks ----

  const onNewNote = useCallback(() => {
    if (!self) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = (rect.width / 2 - viewport.x) / viewport.zoom;
    const cy = (rect.height / 2 - viewport.y) / viewport.zoom;
    setComposing({
      x: cx,
      y: cy,
      rotation: randomRotation(),
      color: randomColor(),
    });
  }, [self, viewport]);

  const zoomByFactor = useCallback(
    (factor: number) => {
      if (!vpSize) return;
      const cx = vpSize.width / 2;
      const cy = vpSize.height / 2;
      const dest = zoomAtPoint(viewport, viewport.zoom * factor, cx, cy);
      animateTo(dest, 220);
    },
    [viewport, vpSize, animateTo],
  );

  const fitAll = useCallback(() => {
    if (!vpSize) return;
    const xs: number[] = [];
    const ys: number[] = [];
    const NOTE_W = 208;
    const NOTE_H = 130;
    for (const n of notes) {
      xs.push(n.x, n.x + NOTE_W);
      ys.push(n.y, n.y + NOTE_H);
    }
    for (const p of pinnedPhotos) {
      if (p.pinned_x !== null && p.pinned_y !== null) {
        xs.push(p.pinned_x, p.pinned_x + NOTE_W);
        ys.push(p.pinned_y, p.pinned_y + NOTE_W);
      }
    }
    for (const s of pinnedSongs) {
      if (s.pinned_x !== null && s.pinned_y !== null) {
        xs.push(s.pinned_x, s.pinned_x + 240);
        ys.push(s.pinned_y, s.pinned_y + 80);
      }
    }
    if (xs.length === 0) {
      animateTo({ x: vpSize.width / 2, y: vpSize.height / 2, zoom: 1 }, 280);
      return;
    }
    const minX = Math.min(...xs) - 80;
    const minY = Math.min(...ys) - 80;
    const maxX = Math.max(...xs) + 80;
    const maxY = Math.max(...ys) + 80;
    const bboxW = maxX - minX;
    const bboxH = maxY - minY;
    const zoomFit = Math.min(
      vpSize.width / bboxW,
      vpSize.height / bboxH,
    );
    const targetZoom = Math.max(0.1, Math.min(1, zoomFit));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    animateTo(
      {
        x: vpSize.width / 2 - cx * targetZoom,
        y: vpSize.height / 2 - cy * targetZoom,
        zoom: targetZoom,
      },
      400,
    );
  }, [notes, pinnedPhotos, pinnedSongs, vpSize, animateTo]);

  const canFit =
    notes.length > 0 || pinnedPhotos.length > 0 || pinnedSongs.length > 0;

  const tonightsPhotos = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return photos.filter(
      (p) => !p.locked && Date.parse(p.reveal_at) > cutoff,
    );
  }, [photos]);

  const jumpToToday = useCallback(() => {
    if (!vpSize) return;
    const today = memoDay();
    const NOTE_W = 208;
    const NOTE_H = 130;
    const SONG_W = 240;
    const SONG_H = 80;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const n of notes) {
      if (memoDay(new Date(n.created_at)) === today) {
        xs.push(n.x, n.x + NOTE_W);
        ys.push(n.y, n.y + NOTE_H);
      }
    }
    for (const p of pinnedPhotos) {
      if (
        p.pinned_x !== null &&
        p.pinned_y !== null &&
        memoDay(new Date(p.taken_at)) === today
      ) {
        xs.push(p.pinned_x, p.pinned_x + NOTE_W);
        ys.push(p.pinned_y, p.pinned_y + NOTE_W);
      }
    }
    for (const s of pinnedSongs) {
      if (s.pinned_x !== null && s.pinned_y !== null && s.memo_day === today) {
        xs.push(s.pinned_x, s.pinned_x + SONG_W);
        ys.push(s.pinned_y, s.pinned_y + SONG_H);
      }
    }
    if (xs.length === 0) {
      animateTo({ x: vpSize.width / 2, y: vpSize.height / 2, zoom: 1 }, 280);
      return;
    }
    const minX = Math.min(...xs) - 80;
    const minY = Math.min(...ys) - 80;
    const maxX = Math.max(...xs) + 80;
    const maxY = Math.max(...ys) + 80;
    const bboxW = maxX - minX;
    const bboxH = maxY - minY;
    const zoomFit = Math.min(vpSize.width / bboxW, vpSize.height / bboxH);
    const targetZoom = Math.max(0.1, Math.min(1, zoomFit));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    animateTo(
      {
        x: vpSize.width / 2 - cx * targetZoom,
        y: vpSize.height / 2 - cy * targetZoom,
        zoom: targetZoom,
      },
      400,
    );
  }, [notes, pinnedPhotos, pinnedSongs, vpSize, animateTo]);

  return (
    <>
      <SelfPicker />
      {!zen && (
        <TopBar
          onEnterZen={() => setZen(true)}
          onOpenRoll={() => setRollOpen(true)}
          onOpenReveal={() => setRevealOpen(true)}
          onOpenArchive={() => setArchiveOpen(true)}
          photos={photos}
        />
      )}
      {!zen && <TodayAnchor count={todayCount} onJump={jumpToToday} />}

      <main
        ref={viewportRef}
        className={`fixed inset-0 overflow-hidden touch-none select-none ${
          zen ? "top-0" : "top-11"
        }`}
        style={{ contain: "strict" }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {visibleNotes.map((note) => (
            <StickyNote
              key={note.id}
              note={note}
              isOwn={self === note.author}
              isToday={isCurrentMemoDay(new Date(note.created_at))}
              tier={tier}
              zoom={viewport.zoom}
              onMove={moveNote}
              interactive={!zen}
              onDragStateChange={setCardDrag}
            />
          ))}
          {visiblePhotos.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              isToday={isCurrentMemoDay(new Date(photo.taken_at))}
              tier={tier}
              zoom={viewport.zoom}
              onMove={movePhoto}
              onTap={setViewing}
              interactive={!zen}
              onDragStateChange={setCardDrag}
            />
          ))}
          {visibleSongs.map((song) => (
            <SongCard
              key={song.id}
              song={song}
              isToday={song.memo_day === memoDay()}
              tier={tier}
              zoom={viewport.zoom}
              onMove={moveSong}
              interactive={!zen}
              onDragStateChange={setCardDrag}
            />
          ))}
          {composing && (
            <NoteComposer
              x={composing.x}
              y={composing.y}
              rotation={composing.rotation}
              initialColor={composing.color}
              onSubmit={(body, color) => {
                createNote(
                  composing.x,
                  composing.y,
                  composing.rotation,
                  body,
                  color,
                );
                setComposing(null);
              }}
              onCancel={() => setComposing(null)}
            />
          )}
        </div>
      </main>

      {!zen && (
        <ZoomControls
          zoom={viewport.zoom}
          onZoomIn={() => zoomByFactor(1.5)}
          onZoomOut={() => zoomByFactor(1 / 1.5)}
          onFit={fitAll}
          canFit={canFit}
        />
      )}

      {!zen && viewport.zoom < 0.15 && (
        <MiniMap
          notes={notes}
          photos={pinnedPhotos}
          songs={pinnedSongs}
          viewport={viewport}
          vpSize={vpSize}
        />
      )}

      {zen && <ZenExit onExit={() => setZen(false)} />}
      {zen && (
        <ZenZoomBar
          onZoomIn={() => zoomByFactor(1.5)}
          onZoomOut={() => zoomByFactor(1 / 1.5)}
          onFit={fitAll}
          canFit={canFit}
        />
      )}

      {revealOpen && (
        <RevealSheet
          photos={tonightsPhotos}
          onPin={pinPhoto}
          onUnpin={unpinPhoto}
          onView={setViewing}
          onClose={() => setRevealOpen(false)}
        />
      )}

      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />

      {/* upload status */}
      {(capture.state !== "idle" || uploadFlash) && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[100] bg-ink text-paper font-pixel text-xs tracking-widest uppercase px-3 py-2 border-2 border-coral shadow-[3px_3px_0_var(--coral)]">
          {capture.state === "processing" && "compressing…"}
          {capture.state === "uploading" && "uploading…"}
          {capture.state === "error" &&
            `error · ${capture.error ?? "upload failed"}`}
          {capture.state === "idle" && uploadFlash}
        </div>
      )}

      {capture.hiddenInput}

      {!zen && (
        <Fabs
          onNewNote={onNewNote}
          onCamera={capture.trigger}
          onSong={() => setSongPickerOpen(true)}
        />
      )}

      {songPickerOpen && (
        <SongPicker
          todaysSong={todaysOwnSong}
          onClose={() => setSongPickerOpen(false)}
          onPicked={pickSong}
        />
      )}

      {rollOpen && (
        <LockedRoll photos={photos} onClose={() => setRollOpen(false)} />
      )}

      {archiveOpen && (
        <ArchiveSheet
          notes={notes}
          photos={photos}
          songs={songs}
          onViewPhoto={setViewing}
          onClose={() => setArchiveOpen(false)}
        />
      )}
    </>
  );
}
