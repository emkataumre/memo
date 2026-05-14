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
  meta: {
    key: string;
    value: string;
  };
}

let dbPromise: Promise<IDBPDatabase<MemoDB>> | null = null;

function getDB(): Promise<IDBPDatabase<MemoDB>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexedDB not available"));
  }
  if (!dbPromise) {
    dbPromise = openDB<MemoDB>("memo", 3, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const notes = db.createObjectStore("notes", { keyPath: "id" });
          notes.createIndex("updated_at", "updated_at");
          db.createObjectStore("meta");
        }
        if (oldVersion < 2) {
          db.createObjectStore("photos", { keyPath: "id" });
        }
        if (oldVersion < 3) {
          db.createObjectStore("songs", { keyPath: "id" });
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

export async function cachePutNotes(notes: Note[]): Promise<void> {
  if (!notes.length) return;
  try {
    const db = await getDB();
    const tx = db.transaction("notes", "readwrite");
    await Promise.all(notes.map((n) => tx.store.put(n)));
    await tx.done;
  } catch {
    /* best-effort */
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

export async function cachePutPhotos(photos: Photo[]): Promise<void> {
  if (!photos.length) return;
  try {
    const db = await getDB();
    const tx = db.transaction("photos", "readwrite");
    await Promise.all(photos.map((p) => tx.store.put(p)));
    await tx.done;
  } catch {
    /* best-effort */
  }
}

/**
 * Replace the entire photos store. Used when poll returns fresh data and
 * we want cached signed URLs / locked flags to match server.
 */
export async function cacheReplacePhotos(photos: Photo[]): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("photos", "readwrite");
    await tx.store.clear();
    await Promise.all(photos.map((p) => tx.store.put(p)));
    await tx.done;
  } catch {
    /* best-effort */
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

export async function cacheReplaceSongs(songs: Song[]): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("songs", "readwrite");
    await tx.store.clear();
    await Promise.all(songs.map((s) => tx.store.put(s)));
    await tx.done;
  } catch {
    /* best-effort */
  }
}

export async function cacheGetMeta(key: string): Promise<string | undefined> {
  try {
    const db = await getDB();
    return await db.get("meta", key);
  } catch {
    return undefined;
  }
}

export async function cacheSetMeta(key: string, value: string): Promise<void> {
  try {
    const db = await getDB();
    await db.put("meta", value, key);
  } catch {
    /* best-effort */
  }
}
