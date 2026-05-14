"use client";

// React hooks that subscribe a component to the module-scope canvas
// stores. Each hook returns the latest array snapshot and triggers a
// re-render whenever its slice changes. Slices are independent — a note
// event does not invalidate `usePhotos()` callers.

import { useSyncExternalStore } from "react";
import type { Note, Photo, Song } from "@/lib/types";
import { notesStore, photosStore, songsStore } from "./stores";

// Stable empty snapshots for SSR / first-render before bootstrap fires.
// useSyncExternalStore requires the server snapshot to be referentially
// stable across calls.
const EMPTY_NOTES: Note[] = [];
const EMPTY_PHOTOS: Photo[] = [];
const EMPTY_SONGS: Song[] = [];

export function useNotes(): Note[] {
  return useSyncExternalStore(
    notesStore.subscribe,
    notesStore.getSnapshot,
    () => EMPTY_NOTES,
  );
}

export function usePhotos(): Photo[] {
  return useSyncExternalStore(
    photosStore.subscribe,
    photosStore.getSnapshot,
    () => EMPTY_PHOTOS,
  );
}

export function useSongs(): Song[] {
  return useSyncExternalStore(
    songsStore.subscribe,
    songsStore.getSnapshot,
    () => EMPTY_SONGS,
  );
}
