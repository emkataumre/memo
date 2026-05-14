"use client";

import { useEffect, useState } from "react";
import { useSelf, setSelf } from "@/lib/self/useSelf";
import type { Author } from "@/lib/types";

export default function SelfPicker() {
  const self = useSelf();
  // Defer rendering until after hydration so the modal never flashes in
  // the initial SSR HTML for users who already have a self tag stored.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return null;
  if (self !== null) return null;

  function pick(name: Author) {
    setSelf(name);
  }

  return (
    <div className="fixed inset-0 bg-black/45 z-[200] flex items-center justify-center p-6">
      <div className="w-full max-w-md border-2 border-ink shadow-[12px_12px_0_var(--ink)] bg-paper">
        <header className="bg-ink text-paper px-3 py-1.5 flex items-center justify-between font-pixel text-xs tracking-widest uppercase">
          <span className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-coral"></span>
            memo · ZDRASTI
          </span>
          <span className="w-4 h-4 border-2 border-paper flex items-center justify-center text-[8px]">
            ✕
          </span>
        </header>
        <div
          className="p-6"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(24,22,21,0.05) 1px, transparent 1px)",
            backgroundSize: "8px 8px",
          }}
        >
          <h2 className="font-display text-3xl leading-none mb-1">
            koi si ti?
          </h2>
          <p className="text-xs text-ink-soft mb-5">obozachi ustroystvoto.</p>
          <div className="flex gap-3">
            <button
              onClick={() => pick("emo")}
              className="flex-1 font-pixel text-xs tracking-widest uppercase px-4 py-3 border-2 border-ink bg-coral shadow-[4px_4px_0_var(--ink)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none cursor-pointer transition-transform"
            >
              emo
            </button>
            <button
              onClick={() => pick("magi")}
              className="flex-1 font-pixel text-xs tracking-widest uppercase px-4 py-3 border-2 border-ink bg-pink shadow-[4px_4px_0_var(--ink)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none cursor-pointer transition-transform"
            >
              magi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
