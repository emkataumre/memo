"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Author, JarState } from "@/lib/types";
import { useSelf } from "@/lib/self/useSelf";
import SelfPicker from "@/components/SelfPicker";
import JarVisual from "./JarVisual";
import JarComposer from "./JarComposer";
import JarDraw from "./JarDraw";

const EMPTY_STATE: JarState = {
  count: 0,
  byAuthor: { emo: 0, magi: 0 },
};

export default function JarClient() {
  const router = useRouter();
  const self = useSelf();
  const [state, setState] = useState<JarState>(EMPTY_STATE);
  const [composing, setComposing] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/jar", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as JarState;
      setState(data);
    } catch {
      /* keep last state on transient errors */
    }
  }, []);

  useEffect(() => {
    // Fetch jar state on mount; this is the "load from external system"
    // pattern useEffect is meant for. The setState inside fetchState is
    // intentional and not a cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchState();
  }, [fetchState]);

  // Refresh on tab focus so a partner's adds appear next time you look.
  useEffect(() => {
    function onVisible() {
      if (!document.hidden) void fetchState();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchState]);

  const handleAdded = useCallback(() => {
    setComposing(false);
    setFlash("dropped in.");
    setTimeout(() => setFlash(null), 1800);
    void fetchState();
  }, [fetchState]);

  const handleTaken = useCallback(() => {
    setDrawing(false);
    setFlash("taken. heading to canvas…");
    void fetchState();
    // Brief pause so the user reads the toast, then over to the canvas
    // where Realtime will surface the new sticky note.
    setTimeout(() => router.push("/"), 900);
  }, [fetchState, router]);

  const selfTyped = self as Author | null;
  const emoCount = state.byAuthor.emo;
  const magiCount = state.byAuthor.magi;

  return (
    <>
      <SelfPicker />
      <header className="sticky top-0 h-11 bg-ink text-paper flex items-center justify-between px-4 z-50 border-b-2 border-ink font-pixel text-xs tracking-widest uppercase">
        <span className="font-display text-2xl text-coral leading-none normal-case tracking-normal">
          memo
        </span>
        <span className="opacity-65 hidden sm:inline">date jar</span>
        <button
          onClick={() => router.push("/")}
          className="border-2 border-paper px-2.5 py-1 active:bg-paper active:text-ink cursor-pointer"
        >
          canvas
        </button>
      </header>

      <main className="min-h-[calc(100vh-44px)] flex flex-col items-center px-5 pt-6 pb-10">
        <h1 className="font-display text-5xl sm:text-6xl leading-none">
          the jar<span className="text-coral">.</span>
        </h1>
        <p className="mt-2 font-pixel text-[10px] tracking-widest uppercase text-ink-soft text-center max-w-[260px]">
          drop ideas. shake one out when you want.
        </p>

        <div className="mt-4 mb-3 flex justify-center">
          <JarVisual count={state.count} />
        </div>

        {/* Count summary */}
        <div className="flex items-baseline gap-2">
          <span className="font-display text-4xl leading-none text-ink">
            {state.count}
          </span>
          <span className="font-pixel text-[11px] tracking-widest uppercase text-ink-soft">
            {state.count === 1 ? "idea" : "ideas"} inside
          </span>
        </div>
        {state.count > 0 && (emoCount > 0 || magiCount > 0) && (
          <div className="mt-2 flex gap-1.5">
            {emoCount > 0 && <AuthorPill name="EMO" count={emoCount} />}
            {magiCount > 0 && <AuthorPill name="MAGI" count={magiCount} />}
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 w-full max-w-sm">
          <button
            onClick={() => setComposing(true)}
            disabled={!selfTyped}
            className="px-4 py-3.5 border-2 border-ink bg-paper-deep font-pixel text-[11px] tracking-widest uppercase cursor-pointer active:translate-x-[3px] active:translate-y-[3px] shadow-[4px_4px_0_var(--ink)] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + add idea
          </button>
          <button
            onClick={() => setDrawing(true)}
            disabled={state.count === 0}
            className="px-4 py-3.5 border-2 border-ink bg-coral text-ink font-pixel text-[11px] tracking-widest uppercase cursor-pointer active:translate-x-[3px] active:translate-y-[3px] shadow-[4px_4px_0_var(--ink)] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            draw one →
          </button>
        </div>

        {flash && (
          <div className="mt-4 font-pixel text-[10px] tracking-widest uppercase text-coral">
            {flash}
          </div>
        )}
      </main>

      {composing && selfTyped && (
        <JarComposer
          self={selfTyped}
          onCancel={() => setComposing(false)}
          onSubmitted={handleAdded}
        />
      )}
      {drawing && (
        <JarDraw
          onClose={() => setDrawing(false)}
          onTaken={handleTaken}
        />
      )}
    </>
  );
}

function AuthorPill({ name, count }: { name: string; count: number }) {
  return (
    <span className="font-pixel text-[10px] tracking-widest uppercase border-2 border-ink px-2 py-1 bg-paper-deep flex items-center gap-2">
      {name}
      <span className="bg-ink text-paper px-1.5 py-0.5 text-[9px]">
        {count}
      </span>
    </span>
  );
}
