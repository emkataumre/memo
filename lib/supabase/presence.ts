"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "./browser";
import type { Author } from "@/lib/types";

// Supabase Realtime Presence carries an in-memory roster of who is
// connected to a channel. We use it solely to render a subtle "partner
// online" dot — no DB write involved. Each tab joins with its `self`
// tag; the channel deduplicates per key so opening a second tab on
// the same identity doesn't double-count.

interface PresenceMeta {
  self: Author;
  online_at: string;
}

export interface PresenceHandlers {
  onChange: (present: Set<Author>) => void;
}

const TOPIC = "memo_presence";

export async function subscribePresence(
  self: Author,
  handlers: PresenceHandlers,
): Promise<() => void> {
  const sb = await getSupabaseBrowser();

  // React StrictMode + HMR can fire the calling effect twice before the
  // previous cleanup has finished removing the channel. Tear down any
  // stale channel of the same topic so `.on()` is never called on an
  // already-subscribed instance.
  for (const c of sb.getChannels()) {
    if (c.topic === `realtime:${TOPIC}`) {
      await sb.removeChannel(c);
    }
  }

  const channel: RealtimeChannel = sb.channel(TOPIC, {
    config: { presence: { key: self } },
  });

  function emit(): void {
    const state = channel.presenceState<PresenceMeta>();
    const present = new Set<Author>();
    for (const entries of Object.values(state)) {
      for (const entry of entries) {
        if (entry.self === "emo" || entry.self === "magi") {
          present.add(entry.self);
        }
      }
    }
    handlers.onChange(present);
  }

  channel
    .on("presence", { event: "sync" }, emit)
    .on("presence", { event: "join" }, emit)
    .on("presence", { event: "leave" }, emit)
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          self,
          online_at: new Date().toISOString(),
        } satisfies PresenceMeta);
      }
    });

  return () => {
    void channel.untrack();
    void sb.removeChannel(channel);
  };
}
