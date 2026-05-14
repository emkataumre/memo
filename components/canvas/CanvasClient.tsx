"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { usePanZoom, zoomAtPoint } from "@/lib/canvas/usePanZoom";
import { lodFromZoom } from "@/lib/canvas/lod";
import { SpatialIndex } from "@/lib/canvas/spatial-index";
import { memoDay, isCurrentMemoDay } from "@/lib/memo-day";
import {
  cacheLoadNotes,
  cacheUpsertNote,
  cacheLoadPhotos,
  cacheUpsertPhoto,
  cacheLoadSongs,
  cacheUpsertSong,
  cacheDelete,
  cacheReplaceAll,
} from "@/lib/cache/indexeddb";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { subscribeCanvas } from "@/lib/supabase/realtime";
import { subscribePresence } from "@/lib/supabase/presence";
import { isLocked } from "@/lib/photos/derive";
import { signCache } from "@/lib/photos/sign-cache";
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
import ConnectionToast from "./ConnectionToast";
import OutboxBadge from "./OutboxBadge";
import { drain, enqueue, updateQueuedItems } from "@/lib/outbox/outbox";
import type {
  Author,
  Note,
  NoteColor,
  NoteVariant,
  Photo,
  Song,
  SpotifyTrack,
} from "@/lib/types";

const COLORS: NoteColor[] = ["lemon", "pink", "sky", "mint"];
// Safety tick — covers cases where setTimeout was throttled (background
// tab, OS suspension) so the UI still flips locked → revealed within a
// minute even if the scheduled timer missed.
const REVEAL_SAFETY_TICK_MS = 60_000;
// Max single setTimeout we trust; longer waits get re-scheduled.
const REVEAL_TIMER_CAP_MS = 12 * 60 * 60 * 1000;

function randomColor(): NoteColor {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function randomRotation(): number {
  return (Math.random() - 0.5) * 10;
}

// Snapshot/live-event reconciler. `stamps` tracks the most recent live
// event for each id, so a snapshot that pre-dates a live update doesn't
// clobber the newer state.
function mergeRows<T extends { id: string }>(
  table: string,
  prev: T[],
  snapshot: T[],
  snapshotTs: number,
  stamps: Map<string, number>,
): T[] {
  const prevById = new Map(prev.map((r) => [r.id, r]));
  const snapIds = new Set(snapshot.map((r) => r.id));
  const out: T[] = [];
  for (const row of snapshot) {
    const localTs = stamps.get(`${table}:${row.id}`) ?? 0;
    if (prevById.has(row.id) && localTs >= snapshotTs) {
      out.push(prevById.get(row.id)!);
    } else {
      out.push(row);
    }
  }
  for (const row of prev) {
    if (snapIds.has(row.id)) continue;
    const localTs = stamps.get(`${table}:${row.id}`) ?? 0;
    // Row not in snapshot. Keep only if a live event after the snapshot
    // re-inserted it; otherwise treat snapshot as authoritative deletion.
    if (localTs >= snapshotTs) out.push(row);
  }
  return out;
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

  // Live state mirrored to refs so the snapshot reconciler can read
  // current values without waiting for a render cycle.
  const notesRef = useRef<Note[]>([]);
  const photosRef = useRef<Photo[]>([]);
  const songsRef = useRef<Song[]>([]);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => {
    songsRef.current = songs;
  }, [songs]);

  // Per-row timestamps of the most recent live event. Used by the
  // snapshot merger to detect updates that arrived after the snapshot
  // was serialized server-side.
  const lastEventTsRef = useRef<Map<string, number>>(new Map());

  // Bumped when a reveal boundary passes so the locked → revealed
  // derivations recompute even though no DB row changed.
  const [revealTick, setRevealTick] = useState(0);

  // Counts how many snapshot resyncs have completed. We use the first
  // tick to fire the initial jump-to-today camera move so the app
  // opens framed on the current memo-day instead of at (0,0,1).
  const [resyncCount, setResyncCount] = useState(0);

  // Live Realtime status. `connected` after SUBSCRIBED, false otherwise.
  // Drives the reconnect toast.
  const [connected, setConnected] = useState(false);

  // Trigger for the outbox auto-drain. Held in a ref so the subscribe
  // effect can poke it when Realtime flips to SUBSCRIBED — that's the
  // fastest "you are online" signal we have (faster + more reliable
  // than `window.online`, which doesn't always fire from DevTools
  // throttling toggles).
  const drainTickRef = useRef<(() => void) | null>(null);

  // Authors currently connected to the presence channel. The TopBar
  // shows a subtle dot when the partner (i.e. anyone other than self)
  // is in this set.
  const [presentAuthors, setPresentAuthors] = useState<Set<Author>>(
    () => new Set(),
  );

  useEffect(() => {
    if (!self) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    (async () => {
      try {
        unsubscribe = await subscribePresence(self, {
          onChange: (present) => {
            if (!cancelled) setPresentAuthors(present);
          },
        });
      } catch (err) {
        console.error("presence subscribe failed", err);
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [self]);

  const partnerPresent = self
    ? Array.from(presentAuthors).some((a) => a !== self)
    : false;

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    function applyNoteEvent(
      payload: RealtimePostgresChangesPayload<Note>,
    ): void {
      const ts = Date.now();
      if (payload.eventType === "DELETE") {
        const id = (payload.old as Partial<Note>).id;
        if (!id) return;
        lastEventTsRef.current.set(`notes:${id}`, ts);
        setNotes((prev) => prev.filter((n) => n.id !== id));
        void cacheDelete("notes", id);
        return;
      }
      const row = payload.new as Note;
      lastEventTsRef.current.set(`notes:${row.id}`, ts);
      // Touch = top: move (or insert) at the end of the array so the
      // most recently changed note stacks above older siblings.
      setNotes((prev) => [...prev.filter((n) => n.id !== row.id), row]);
      void cacheUpsertNote(row);
    }

    function applyPhotoEvent(
      payload: RealtimePostgresChangesPayload<Photo>,
    ): void {
      const ts = Date.now();
      if (payload.eventType === "DELETE") {
        const id = (payload.old as Partial<Photo>).id;
        if (!id) return;
        lastEventTsRef.current.set(`photos:${id}`, ts);
        signCache.evict(id);
        setPhotos((prev) => prev.filter((p) => p.id !== id));
        void cacheDelete("photos", id);
        return;
      }
      const row = payload.new as Photo;
      lastEventTsRef.current.set(`photos:${row.id}`, ts);
      // INSERT: row is locked at upload time; sign-cache will resolve
      //   once it crosses reveal_at.
      // UPDATE: pin/move/caption updates don't change storage_path,
      //   so cached URLs (if any) stay valid.
      if (!isLocked(row)) signCache.ensureMany([row.id]);
      setPhotos((prev) => {
        const idx = prev.findIndex((p) => p.id === row.id);
        if (idx >= 0) {
          const copy = prev.slice();
          copy[idx] = row;
          return copy;
        }
        return [...prev, row];
      });
      void cacheUpsertPhoto(row);
    }

    function applySongEvent(
      payload: RealtimePostgresChangesPayload<Song>,
    ): void {
      const ts = Date.now();
      if (payload.eventType === "DELETE") {
        const id = (payload.old as Partial<Song>).id;
        if (!id) return;
        lastEventTsRef.current.set(`songs:${id}`, ts);
        setSongs((prev) => prev.filter((s) => s.id !== id));
        void cacheDelete("songs", id);
        return;
      }
      const row = payload.new as Song;
      lastEventTsRef.current.set(`songs:${row.id}`, ts);
      setSongs((prev) => {
        const idx = prev.findIndex((s) => s.id === row.id);
        if (idx >= 0) {
          const copy = prev.slice();
          copy[idx] = row;
          return copy;
        }
        return [...prev, row];
      });
      void cacheUpsertSong(row);
    }

    async function resync(): Promise<void> {
      if (cancelled) return;
      const snapshotTs = Date.now();
      const sb = await getSupabaseBrowser();
      const [
        { data: nRows, error: nErr },
        { data: pRows, error: pErr },
        { data: sRows, error: sErr },
      ] = await Promise.all([
        sb.from("notes").select("*").order("updated_at", { ascending: true }),
        sb.from("photos").select("*").order("taken_at", { ascending: true }),
        sb.from("songs").select("*").order("memo_day", { ascending: true }),
      ]);
      if (cancelled) return;
      if (nErr || pErr || sErr) {
        // RLS misconfig or auth blip — let the next resync retry.
        return;
      }

      const mergedNotes = mergeRows(
        "notes",
        notesRef.current,
        (nRows ?? []) as Note[],
        snapshotTs,
        lastEventTsRef.current,
      );
      const mergedPhotos = mergeRows(
        "photos",
        photosRef.current,
        (pRows ?? []) as Photo[],
        snapshotTs,
        lastEventTsRef.current,
      );
      const mergedSongs = mergeRows(
        "songs",
        songsRef.current,
        (sRows ?? []) as Song[],
        snapshotTs,
        lastEventTsRef.current,
      );

      setNotes(mergedNotes);
      setPhotos(mergedPhotos);
      setSongs(mergedSongs);
      setResyncCount((n) => n + 1);

      const revealedIds = mergedPhotos
        .filter((p) => !isLocked(p))
        .map((p) => p.id);
      if (revealedIds.length > 0) signCache.ensureMany(revealedIds);

      void cacheReplaceAll(mergedNotes, mergedPhotos, mergedSongs);
    }

    async function bootstrap(): Promise<void> {
      const [cachedNotes, cachedPhotos, cachedSongs] = await Promise.all([
        cacheLoadNotes(),
        cacheLoadPhotos(),
        cacheLoadSongs(),
      ]);
      if (cancelled) return;
      if (cachedNotes.length) setNotes(cachedNotes);
      if (cachedPhotos.length) setPhotos(cachedPhotos);
      if (cachedSongs.length) setSongs(cachedSongs);

      try {
        unsubscribe = await subscribeCanvas({
          onNote: applyNoteEvent,
          onPhoto: applyPhotoEvent,
          onSong: applySongEvent,
          onResync: resync,
          onStatus: (status) => {
            if (cancelled) return;
            const isConnected = status === "connected";
            setConnected(isConnected);
            if (isConnected) drainTickRef.current?.();
          },
        });
      } catch (err) {
        // getSupabaseBrowser redirects to /passphrase on 401; other
        // errors leave the user with cached state until they refresh.
        console.error("realtime subscribe failed", err);
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Outbox auto-drain. Mutations that failed offline live in IndexedDB
  // until network returns; we replay them here on online events, tab
  // visibility, and every 30 s as a safety tick.
  useEffect(() => {
    let cancelled = false;

    function applyResult(result: import("@/lib/outbox/outbox").DrainResult) {
      if (cancelled) return;
      if (result.status !== "ok") return;
      if (result.item.tag === "note:create") {
        const real = (result.response as { note?: Note } | null)?.note;
        const tempId =
          typeof result.item.meta?.tempId === "string"
            ? result.item.meta.tempId
            : null;
        if (real && tempId) {
          setNotes((prev) => {
            // Drop any real-id row that may have arrived via realtime
            // already, then swap the tempId entry for the real one.
            const withoutDup = prev.filter((n) => n.id !== real.id);
            return withoutDup.map((n) => (n.id === tempId ? real : n));
          });
          void cacheUpsertNote(real);
        }
      }
      // Other tags (note:move, jar:add, etc.) just need the queue drained;
      // realtime / refetch reconciles the state.
    }

    function tick() {
      if (cancelled) return;
      void drain(applyResult);
    }

    drainTickRef.current = tick;
    window.addEventListener("online", tick);
    function onVisible() {
      if (!document.hidden) tick();
    }
    document.addEventListener("visibilitychange", onVisible);
    // Safety net: short interval so a missed `online` event + a flaky
    // Realtime reconnect still flush within seconds, not half a minute.
    const interval = setInterval(tick, 5_000);

    // Kick once on mount so anything left over from a previous session
    // flushes as soon as we're back.
    tick();

    return () => {
      cancelled = true;
      drainTickRef.current = null;
      window.removeEventListener("online", tick);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, []);

  // Reveal-boundary timer: flip `isLocked` derivations the moment a
  // photo's reveal_at passes. The 60s safety tick covers throttled
  // timers (background tab, OS suspension).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    function schedule(): void {
      if (timer) clearTimeout(timer);
      const now = Date.now();
      let nextAt = Infinity;
      for (const p of photos) {
        const t = Date.parse(p.reveal_at);
        if (t > now && t < nextAt) nextAt = t;
      }
      if (nextAt === Infinity) return;
      const delay = Math.min(nextAt - now, REVEAL_TIMER_CAP_MS);
      timer = setTimeout(() => {
        setRevealTick((t) => t + 1);
        // Photos that just unlocked need signed URLs.
        const justRevealedIds = photosRef.current
          .filter((p) => !isLocked(p))
          .map((p) => p.id);
        if (justRevealedIds.length > 0) {
          signCache.ensureMany(justRevealedIds);
        }
        schedule();
      }, Math.max(0, delay));
    }

    schedule();
    const safetyInterval = setInterval(
      () => setRevealTick((t) => t + 1),
      REVEAL_SAFETY_TICK_MS,
    );

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(safetyInterval);
    };
  }, [photos]);

  // Capture (camera) hook. Realtime INSERT will surface the locked photo
  // in the PendingPill count automatically once it lands in the DB.
  const capture = useCapture(() => {
    setUploadFlash("locked in.");
    setTimeout(() => setUploadFlash(null), 2500);
  });

  // ---- Derived data ----

  const pinnedPhotos = useMemo(
    () => photos.filter((p) => !isLocked(p) && p.pinned_at !== null),
    // revealTick re-runs the filter at the moment a photo unlocks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [photos, revealTick],
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
      variant: NoteVariant,
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
        width: null,
        height: null,
        variant,
        created_at: now,
        updated_at: now,
      };
      setNotes((prev) => [...prev, optimistic]);

      const postBody = { author: self, body, color, x, y, rotation, variant };

      try {
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(postBody),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { note: Note };
        setNotes((prev) =>
          prev.map((n) => (n.id === tempId ? data.note : n)),
        );
        await cacheUpsertNote(data.note);
      } catch {
        // Offline (or server hiccup). Keep the optimistic note visible
        // and queue the create. Drain swaps tempId → real id later.
        await enqueue({
          tag: "note:create",
          method: "POST",
          path: "/api/notes",
          body: postBody,
          meta: { tempId },
        });
      }
    },
    [self],
  );

  const resizeNote = useCallback(
    async (id: string, width: number, height: number) => {
      setNotes((prev) => {
        const target = prev.find((n) => n.id === id);
        if (!target) return prev;
        const others = prev.filter((n) => n.id !== id);
        return [
          ...others,
          {
            ...target,
            width,
            height,
            updated_at: new Date().toISOString(),
          },
        ];
      });
      // Temp id: fold the new size into the queued create body so the
      // drain replays at the right dimensions.
      if (id.startsWith("temp-")) {
        await updateQueuedItems(
          (item) =>
            item.tag === "note:create" &&
            typeof item.meta?.tempId === "string" &&
            item.meta.tempId === id,
          (item) => ({
            ...item,
            body: {
              ...(item.body as Record<string, unknown>),
              width,
              height,
            },
          }),
        );
        return;
      }
      try {
        const res = await fetch(`/api/notes/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ width, height }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { note: Note };
        await cacheUpsertNote(data.note);
      } catch {
        await enqueue({
          tag: "note:move",
          method: "PATCH",
          path: `/api/notes/${id}`,
          body: { width, height },
          meta: { noteId: id, kind: "resize" },
        });
      }
    },
    [],
  );

  const moveNote = useCallback(async (id: string, x: number, y: number) => {
    setNotes((prev) => {
      // Touch = top: pull the moved note out and reinsert at the end.
      const target = prev.find((n) => n.id === id);
      if (!target) return prev;
      const others = prev.filter((n) => n.id !== id);
      return [
        ...others,
        { ...target, x, y, updated_at: new Date().toISOString() },
      ];
    });
    // Temp id: the create POST is still queued. Patch its body so the
    // drain replays with the latest coords instead of where the note
    // was originally dropped.
    if (id.startsWith("temp-")) {
      await updateQueuedItems(
        (item) =>
          item.tag === "note:create" &&
          typeof item.meta?.tempId === "string" &&
          item.meta.tempId === id,
        (item) => ({
          ...item,
          body: {
            ...(item.body as Record<string, unknown>),
            x,
            y,
          },
        }),
      );
      return;
    }
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x, y }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { note: Note };
      await cacheUpsertNote(data.note);
    } catch {
      await enqueue({
        tag: "note:move",
        method: "PATCH",
        path: `/api/notes/${id}`,
        body: { x, y },
        meta: { noteId: id },
      });
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
        xs.push(s.pinned_x, s.pinned_x + 280);
        ys.push(s.pinned_y, s.pinned_y + 160);
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
      (p) => !isLocked(p) && Date.parse(p.reveal_at) > cutoff,
    );
    // revealTick: same reason as pinnedPhotos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, revealTick]);

  const jumpToToday = useCallback((durationArg?: number) => {
    if (!vpSize) return;
    // Defensive: if a caller accidentally passes a non-number (e.g. an
    // onClick event object), fall back to the default. Without this,
    // animateTo divides by a non-finite value and the viewport becomes
    // NaN forever.
    const duration =
      typeof durationArg === "number" && Number.isFinite(durationArg)
        ? durationArg
        : 400;
    const today = memoDay();
    const NOTE_W = 208;
    const NOTE_H = 130;
    const SONG_W = 280;
    const SONG_H = 160;
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
      animateTo(
        { x: vpSize.width / 2, y: vpSize.height / 2, zoom: 1 },
        duration === 0 ? 0 : 280,
      );
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
      duration,
    );
  }, [notes, pinnedPhotos, pinnedSongs, vpSize, animateTo]);

  // First-paint camera: snap to today's frame as soon as the snapshot
  // has loaded and the viewport is sized. Avoids the user landing at
  // (0,0) with nothing in view.
  const initialJumpRef = useRef(false);
  useEffect(() => {
    if (initialJumpRef.current) return;
    if (resyncCount === 0 || !vpSize) return;
    initialJumpRef.current = true;
    jumpToToday(0);
  }, [resyncCount, vpSize, jumpToToday]);

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
          partnerPresent={partnerPresent}
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
              onResize={resizeNote}
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
              onSubmit={(body, color, variant) => {
                createNote(
                  composing.x,
                  composing.y,
                  composing.rotation,
                  body,
                  color,
                  variant,
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

      <ConnectionToast connected={connected} />
      <OutboxBadge />

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
