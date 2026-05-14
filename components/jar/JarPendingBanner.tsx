"use client";

import { useState } from "react";
import type { DateIdea } from "@/lib/types";

interface Props {
  idea: DateIdea;
  onCancel: () => void;
  onLog: () => void;
}

// Sticky-style coral banner that surfaces the single pending date entity.
// Lives at the top of the jar page only — the canvas never knows about it.
// Two actions: cancel (returns to in_jar) and log (opens the completion sheet).
export default function JarPendingBanner({ idea, onCancel, onLog }: Props) {
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    if (cancelling) return;
    if (
      !window.confirm(
        `cancel "${truncate(idea.body, 40)}" and drop it back in the jar?`,
      )
    ) {
      return;
    }
    setCancelling(true);
    try {
      const res = await fetch("/api/jar/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: idea.id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `status ${res.status}`);
      }
      onCancel();
    } catch {
      setCancelling(false);
      // Surface failures inline — banner stays. Keep simple alert; the
      // user is on a stable connection most of the time.
      window.alert("couldn't cancel. try again.");
    }
  }

  return (
    <section
      aria-label="Pending date"
      className="w-full max-w-md mx-auto mt-4 border-2 border-ink bg-coral text-ink shadow-[6px_6px_0_var(--ink)]"
    >
      <header className="bg-ink text-coral px-3 py-1.5 flex items-center justify-between font-pixel text-[10px] tracking-widest uppercase">
        <span className="flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 bg-coral animate-pulse" />
          pending date · from {idea.author}
        </span>
      </header>
      <div className="p-4">
        <p className="font-display text-2xl leading-tight whitespace-pre-wrap break-words">
          {idea.body}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="px-3 py-3 border-2 border-ink bg-paper text-ink font-pixel text-[10px] tracking-widest uppercase cursor-pointer active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50"
          >
            {cancelling ? "…" : "back to jar"}
          </button>
          <button
            onClick={onLog}
            disabled={cancelling}
            className="px-3 py-3 border-2 border-ink bg-ink text-coral font-pixel text-[10px] tracking-widest uppercase cursor-pointer active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50"
          >
            log it →
          </button>
        </div>
      </div>
    </section>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
