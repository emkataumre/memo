"use client";

import { useEffect, useRef, useState } from "react";
import type { DateIdea } from "@/lib/types";

interface Props {
  onClose: () => void;
  onTaken: () => void;
}

type Phase = "drawing" | "shown" | "deciding" | "empty" | "error";

export default function JarDraw({ onClose, onTaken }: Props) {
  const [phase, setPhase] = useState<Phase>("drawing");
  const [idea, setIdea] = useState<DateIdea | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Track which ids we've already shown this session so "draw another"
  // prefers slips the user hasn't seen yet.
  const seenRef = useRef<Set<string>>(new Set());

  async function drawOne(): Promise<void> {
    setPhase("drawing");
    setError(null);
    try {
      const res = await fetch("/api/jar/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludeIds: Array.from(seenRef.current) }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { idea: DateIdea | null };
      if (!data.idea) {
        setPhase("empty");
        setIdea(null);
        return;
      }
      seenRef.current.add(data.idea.id);
      setIdea(data.idea);
      setPhase("shown");
    } catch (err) {
      setError(err instanceof Error ? err.message : "draw failed");
      setPhase("error");
    }
  }

  useEffect(() => {
    // Kick off the first draw on mount — synchronising with the server,
    // which is a valid useEffect pattern. setState inside drawOne is
    // intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void drawOne();
  }, []);

  async function decide(take: boolean): Promise<void> {
    if (!idea) return;
    setPhase("deciding");
    try {
      const res = await fetch("/api/jar/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: idea.id, take }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      if (take) {
        onTaken();
      } else {
        // Put back; let user keep drawing or close.
        seenRef.current.delete(idea.id);
        setIdea(null);
        setPhase("shown");
        await drawOne();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "decide failed");
      setPhase("error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] bg-ink/80 flex items-center justify-center p-5"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-paper border-2 border-ink shadow-[10px_10px_0_var(--coral)]"
      >
        <header className="bg-ink text-paper px-3 py-1.5 flex items-center justify-between font-pixel text-[11px] tracking-widest uppercase">
          <span className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-coral"></span>
            draw
          </span>
          <button
            onClick={onClose}
            className="w-4 h-4 border-2 border-paper flex items-center justify-center text-[8px] cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {phase === "drawing" && (
          <div className="p-8 text-center font-pixel text-[11px] tracking-widest uppercase text-ink-soft">
            shaking the jar…
          </div>
        )}

        {phase === "empty" && (
          <div className="p-8 text-center">
            <div className="font-display text-3xl text-ink mb-2">
              jar&rsquo;s empty<span className="text-coral">.</span>
            </div>
            <p className="font-mono text-xs text-ink-soft">
              add something first.
            </p>
            <button
              onClick={onClose}
              className="mt-5 px-3 py-2 border-2 border-ink bg-paper-deep font-pixel text-[10px] tracking-widest uppercase cursor-pointer active:translate-x-[2px] active:translate-y-[2px]"
            >
              back
            </button>
          </div>
        )}

        {phase === "error" && (
          <div className="p-8 text-center">
            <p className="text-coral font-pixel text-[10px] tracking-widest uppercase">
              {error ?? "something went wrong"}
            </p>
            <button
              onClick={() => void drawOne()}
              className="mt-5 px-3 py-2 border-2 border-ink bg-paper-deep font-pixel text-[10px] tracking-widest uppercase cursor-pointer active:translate-x-[2px] active:translate-y-[2px]"
            >
              try again
            </button>
          </div>
        )}

        {(phase === "shown" || phase === "deciding") && idea && (
          <div className="p-5">
            {/* Slip of paper */}
            <div
              className="bg-white border-2 border-ink shadow-[4px_4px_0_var(--ink)] p-5 my-4 mx-2"
              style={{ transform: "rotate(-1.2deg)" }}
            >
              <div className="font-pixel text-[9px] tracking-widest uppercase text-coral mb-2">
                from {idea.author}
              </div>
              <div className="font-display text-2xl leading-tight text-ink whitespace-pre-wrap break-words">
                {idea.body}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-5">
              <button
                onClick={() => void decide(false)}
                disabled={phase === "deciding"}
                className="px-3 py-3 border-2 border-ink bg-paper-deep font-pixel text-[10px] tracking-widest uppercase cursor-pointer active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50"
              >
                back in jar
              </button>
              <button
                onClick={() => void decide(true)}
                disabled={phase === "deciding"}
                className="px-3 py-3 border-2 border-ink bg-coral text-ink font-pixel text-[10px] tracking-widest uppercase shadow-[3px_3px_0_var(--ink)] cursor-pointer active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                take it →
              </button>
            </div>
            <div className="mt-2 font-pixel text-[9px] tracking-widest uppercase text-ink-soft text-center">
              {phase === "deciding"
                ? "…"
                : "“back in jar” draws another"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
