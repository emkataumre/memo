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

// Mirrors the Supabase-JS status strings we care about. We collapse
// everything that isn't `SUBSCRIBED` into a single "connecting" mode
// so the UI doesn't need to reason about transient distinctions.
export type ConnectionStatus = "connecting" | "connected";

export interface CanvasHandlers {
  onNote: (payload: RealtimePostgresChangesPayload<Note>) => void;
  onPhoto: (payload: RealtimePostgresChangesPayload<Photo>) => void;
  onSong: (payload: RealtimePostgresChangesPayload<Song>) => void;
  onResync: () => void | Promise<void>;
  onStatus?: (status: ConnectionStatus) => void;
}

const TOPIC = "memo_canvas";

export async function subscribeCanvas(
  handlers: CanvasHandlers,
): Promise<() => void> {
  const sb = await getSupabaseBrowser();

  // Defensive: drop any stale instance of this channel before binding
  // listeners. Matches the StrictMode/HMR teardown race in presence.ts.
  for (const c of sb.getChannels()) {
    if (c.topic === `realtime:${TOPIC}`) {
      await sb.removeChannel(c);
    }
  }

  const channel: RealtimeChannel = sb
    .channel(TOPIC)
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
        handlers.onStatus?.("connected");
        void handlers.onResync();
      } else {
        // CHANNEL_ERROR / TIMED_OUT / CLOSED — Supabase JS auto-reconnects
        // with exponential backoff; we just surface the "not green" state
        // so the UI can show a reconnect toast.
        handlers.onStatus?.("connecting");
      }
    });

  return () => {
    void sb.removeChannel(channel);
  };
}
