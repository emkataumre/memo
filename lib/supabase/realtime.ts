"use client";

import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { getSupabaseBrowser } from "./browser";
import type { Note, Photo, Song } from "@/lib/types";

// Single multiplexed channel for the three live tables. Supabase
// Realtime is not durable — events between disconnect and reconnect
// are dropped. `onResync` fires on initial SUBSCRIBED and on every
// reconnect; callers should refetch a fresh snapshot there.

export interface CanvasHandlers {
  onNote: (payload: RealtimePostgresChangesPayload<Note>) => void;
  onPhoto: (payload: RealtimePostgresChangesPayload<Photo>) => void;
  onSong: (payload: RealtimePostgresChangesPayload<Song>) => void;
  onResync: () => void | Promise<void>;
}

export async function subscribeCanvas(
  handlers: CanvasHandlers,
): Promise<() => void> {
  const sb = await getSupabaseBrowser();
  const channel: RealtimeChannel = sb
    .channel("memo_canvas")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notes" },
      handlers.onNote,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "photos" },
      handlers.onPhoto,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "songs" },
      handlers.onSong,
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void handlers.onResync();
      }
    });

  return () => {
    void sb.removeChannel(channel);
  };
}
