"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Note, Photo, Song } from "@/lib/types";

interface MemoDB extends DBSchema {
  notes: {
    key: string;
    value: Note;
    indexes: { updated_at: string };
  };
  photos: {
    key: string;
    value: Photo;
  };
  songs: {
    key: string;
    value: Song;
  };
}

let dbPromise: Promise<IDBPDatabase<MemoDB>> | null = null;

function getDB(): Promise<IDBPDatabase<MemoDB>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexedDB not available"));
  }
  if (!dbPromise) {
    dbPromise = openDB<MemoDB>("memo", 4, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const notes = db.createObjectStore("notes", { keyPath: "id" });
          notes.createIndex("updated_at", "updated_at");
        }
        if (oldVersion < 2) {
          db.createObjectStore("photos", { keyPath: "id" });
        }
        if (oldVersion < 3) {
          db.createObjectStore("songs", { keyPath: "id" });
        }
        if (oldVersion < 4) {
          // The meta store was used for the polling `since` cursor.
          // Realtime + snapshot reconciliation replaced that flow. The
          // schema type no longer lists "meta", so we drop into a raw
          // shape just for this cleanup.
          const raw = db as unknown as {
            objectStoreNames: DOMStringList;
            deleteObjectStore: (name: string) => void;
          };
          if (raw.objectStoreNames.contains("meta")) {
            raw.deleteObjectStore("meta");
          }
        }
      },
    });
  }
  return dbPromise;
}

export async function cacheLoadNotes(): Promise<Note[]> {
  try {
    const db = await getDB();
    return await db.getAll("notes");
  } catch {
    return [];
  }
}

export async function cacheLoadPhotos(): Promise<Photo[]> {
  try {
    const db = await getDB();
    return await db.getAll("photos");
  } catch {
    return [];
  }
}

export async function cacheLoadSongs(): Promise<Song[]> {
  try {
    const db = await getDB();
    return await db.getAll("songs");
  } catch {
    return [];
  }
}

export async function cacheUpsertNote(n: Note): Promise<void> {
  try {
    const db = await getDB();
    await db.put("notes", n);
  } catch {
    /* best-effort */
  }
}

export async function cacheUpsertPhoto(p: Photo): Promise<void> {
  try {
    const db = await getDB();
    await db.put("photos", p);
  } catch {
    /* best-effort */
  }
}

export async function cacheUpsertSong(s: Song): Promise<void> {
  try {
    const db = await getDB();
    await db.put("songs", s);
  } catch {
    /* best-effort */
  }
}

export type CacheStore = "notes" | "photos" | "songs";

export async function cacheDelete(
  store: CacheStore,
  id: string,
): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(store, id);
  } catch {
    /* best-effort */
  }
}

// Bulk overwrite, used by the snapshot reconciler on (re)subscribe.
// The local React state is the source of truth at this point; we mirror
// it to IndexedDB in one transaction so cold reload picks up the same
// shape.
export async function cacheReplaceAll(
  notes: Note[],
  photos: Photo[],
  songs: Song[],
): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(["notes", "photos", "songs"], "readwrite");
    await Promise.all([
      tx.objectStore("notes").clear(),
      tx.objectStore("photos").clear(),
      tx.objectStore("songs").clear(),
    ]);
    await Promise.all([
      ...notes.map((n) => tx.objectStore("notes").put(n)),
      ...photos.map((p) => tx.objectStore("photos").put(p)),
      ...songs.map((s) => tx.objectStore("songs").put(s)),
    ]);
    await tx.done;
  } catch {
    /* best-effort */
  }
}
