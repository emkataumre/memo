"use client";

// Module-scope stores for the canvas data slices (notes / photos / songs).
//
// Each store is a single source of truth that:
//   - exposes useSyncExternalStore semantics (getSnapshot / subscribe)
//   - applies Realtime postgres_changes payloads (.apply)
//   - reconciles snapshot vs live events using a per-id timestamp Map (.merge)
//   - allows callers to read/replace rows imperatively (.getSnapshot / .update)
//
// State outlives the React component tree, so cross-page navigation
// (/canvas → /jar → /canvas) skips the bootstrap flash. Persisted
// timestamps are fine because they're always older than the next
// snapshotTs and lose merge tie-breaks naturally.

import type { Note, Photo, Song } from "@/lib/types";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import {
  cacheUpsertNote,
  cacheUpsertPhoto,
  cacheUpsertSong,
  cacheDelete,
} from "@/lib/cache/indexeddb";
import { isLocked } from "@/lib/photos/derive";
import { signCache } from "@/lib/photos/sign-cache";

type Listener = () => void;

interface StoreOpts<T extends { id: string }> {
  touchTop: boolean;
  cacheUpsert: (row: T) => unknown;
  cacheDelete: (id: string) => unknown;
  onInsertOrUpdate?: (row: T) => void;
  onDelete?: (id: string) => void;
}

class ListStore<T extends { id: string }> {
  private rows: T[] = [];
  private listeners = new Set<Listener>();
  private stamps = new Map<string, number>();

  constructor(private opts: StoreOpts<T>) {}

  getSnapshot = (): T[] => this.rows;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private setRows(next: T[]): void {
    if (next === this.rows) return;
    this.rows = next;
    this.emit();
  }

  // Drop-in replacement for `setState(updater)`.
  update = (updater: (prev: T[]) => T[]): void => {
    this.setRows(updater(this.rows));
  };

  // Bulk overwrite. Used by bootstrap (IDB cache load).
  replaceAll = (rows: T[]): void => {
    this.rows = rows;
    this.emit();
  };

  // Mark a row as recently changed locally. Local optimistic mutations
  // do not flow through `apply()` (those only fire on Realtime echoes),
  // so without this the merger treats locally-touched rows as stale and
  // overwrites them with the server snapshot — reverting position and
  // touch-top order. Mutation callers must call `touch(id)` immediately
  // after `update(...)` so subsequent resyncs preserve the local state.
  touch = (id: string): void => {
    this.stamps.set(id, Date.now());
  };

  // Handle a Realtime postgres_changes payload. Tracks the event ts so
  // a stale snapshot resync doesn't overwrite newer live state.
  apply = (payload: RealtimePostgresChangesPayload<T>): void => {
    const ts = Date.now();
    if (payload.eventType === "DELETE") {
      const id = (payload.old as Partial<T>).id;
      if (!id) return;
      this.stamps.set(id, ts);
      this.opts.onDelete?.(id);
      void this.opts.cacheDelete(id);
      this.setRows(this.rows.filter((r) => r.id !== id));
      return;
    }
    const row = payload.new as T;
    if (!row?.id) return;
    this.stamps.set(row.id, ts);
    this.opts.onInsertOrUpdate?.(row);
    void this.opts.cacheUpsert(row);
    if (this.opts.touchTop) {
      this.setRows([...this.rows.filter((r) => r.id !== row.id), row]);
      return;
    }
    const idx = this.rows.findIndex((r) => r.id === row.id);
    if (idx >= 0) {
      const copy = this.rows.slice();
      copy[idx] = row;
      this.setRows(copy);
    } else {
      this.setRows([...this.rows, row]);
    }
  };

  // Snapshot reconcile. Two-pass to preserve local touch-top order:
  //   Pass 1: walk snapshot order. For rows where local is fresher
  //           (localTs >= snapshotTs), defer to pass 2 — emitting them
  //           now would lock in the server's stale ordering.
  //   Pass 2: walk prev order, appending deferred + prev-only-fresh rows.
  // Net effect: server-known rows keep snapshot order; locally-touched
  // rows bubble to the end in the order the user last touched them.
  merge = (snapshot: T[], snapshotTs: number): T[] => {
    const prevById = new Map(this.rows.map((r) => [r.id, r]));
    const snapIds = new Set(snapshot.map((r) => r.id));
    const deferred = new Set<string>();
    const out: T[] = [];
    for (const row of snapshot) {
      const localTs = this.stamps.get(row.id) ?? 0;
      if (prevById.has(row.id) && localTs >= snapshotTs) {
        deferred.add(row.id);
        continue;
      }
      out.push(row);
    }
    for (const row of this.rows) {
      if (snapIds.has(row.id)) {
        if (deferred.has(row.id)) out.push(row);
        continue;
      }
      const localTs = this.stamps.get(row.id) ?? 0;
      if (localTs >= snapshotTs) out.push(row);
    }
    this.setRows(out);
    return out;
  };
}

export const notesStore = new ListStore<Note>({
  touchTop: true,
  cacheUpsert: cacheUpsertNote,
  cacheDelete: (id) => cacheDelete("notes", id),
});

export const photosStore = new ListStore<Photo>({
  touchTop: true,
  cacheUpsert: cacheUpsertPhoto,
  cacheDelete: (id) => cacheDelete("photos", id),
  onInsertOrUpdate: (row) => {
    // INSERT: locked at upload time; sign-cache resolves once reveal_at passes.
    // UPDATE: pin/move/caption don't change storage_path, so cached URLs stay valid.
    if (!isLocked(row)) signCache.ensureMany([row.id]);
  },
  onDelete: (id) => {
    signCache.evict(id);
  },
});

export const songsStore = new ListStore<Song>({
  touchTop: true,
  cacheUpsert: cacheUpsertSong,
  cacheDelete: (id) => cacheDelete("songs", id),
});
