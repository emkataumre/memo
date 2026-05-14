"use client";

import { useState } from "react";
import type { Author } from "@/lib/types";
import { enqueue } from "@/lib/outbox/outbox";

interface Props {
  self: Author;
  onCancel: () => void;
  onSubmitted: () => void;
}

const MAX_LEN = 500;

export default function JarComposer({ self, onCancel, onSubmitted }: Props) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (submitting) return;
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/jar/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: self, body: trimmed }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `status ${res.status}`);
      }
      onSubmitted();
    } catch {
      // Treat any failure (offline or 5xx) as "queue for later". 4xx
      // shouldn't happen here — the input is validated client-side and
      // the route is auth-gated by the proxy.
      try {
        await enqueue({
          tag: "jar:add",
          method: "POST",
          path: "/api/jar/add",
          body: { author: self, body: trimmed },
        });
        onSubmitted();
      } catch (queueErr) {
        setError(
          queueErr instanceof Error ? queueErr.message : "failed to add",
        );
        setSubmitting(false);
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] bg-ink/70 flex items-center justify-center p-5"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-paper border-2 border-ink shadow-[10px_10px_0_var(--ink)]"
      >
        <header className="bg-ink text-paper px-3 py-1.5 flex items-center justify-between font-pixel text-[11px] tracking-widest uppercase">
          <span>new idea · {self}</span>
          <button
            onClick={onCancel}
            className="w-4 h-4 border-2 border-paper flex items-center justify-center text-[8px] cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <div className="p-4">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX_LEN))}
            placeholder="picnic at the park · sushi night · stargazing on the rooftop…"
            autoFocus
            rows={3}
            className="w-full bg-white border-2 border-ink p-3 font-mono text-sm resize-none focus:outline-none focus:border-coral"
          />
          <div className="mt-2 font-pixel text-[9px] tracking-widest uppercase text-ink-soft flex justify-between">
            <span>{body.length} / {MAX_LEN}</span>
            <span>once in, only a draw gets it out</span>
          </div>
          {error && (
            <p className="mt-2 text-coral font-pixel text-[10px] tracking-widest uppercase">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-2 justify-end">
            <button
              onClick={onCancel}
              disabled={submitting}
              className="px-3 py-2 border-2 border-ink bg-paper-deep font-pixel text-[10px] tracking-widest uppercase cursor-pointer active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50"
            >
              cancel
            </button>
            <button
              onClick={submit}
              disabled={submitting || body.trim().length === 0}
              className="px-3 py-2 border-2 border-ink bg-coral text-ink font-pixel text-[10px] tracking-widest uppercase shadow-[3px_3px_0_var(--ink)] cursor-pointer active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "…" : "drop in jar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
