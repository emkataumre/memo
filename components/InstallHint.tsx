"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "memo_install_dismissed";

export default function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    if (window.matchMedia?.("(display-mode: standalone)").matches) return;
    if (
      "standalone" in window.navigator &&
      (window.navigator as Navigator & { standalone?: boolean }).standalone
    )
      return;

    const ua = window.navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    if (!isIOS) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(true);
  }, []);

  if (!show) return null;

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setShow(false);
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[120] bg-paper border-2 border-ink shadow-[6px_6px_0_var(--coral)] p-3.5 flex items-start gap-3">
      <div className="flex-1 font-mono text-[13px] leading-tight">
        <div className="font-pixel text-[10px] tracking-widest uppercase text-coral mb-1">
          install · ios
        </div>
        tap{" "}
        <span className="inline-flex items-center justify-center w-5 h-5 align-middle border border-ink-soft rounded text-[10px]">
          ⬆
        </span>{" "}
        then <strong>add to home screen</strong>.
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="font-pixel text-xs text-ink-soft cursor-pointer w-7 h-7 flex items-center justify-center border border-ink-soft active:translate-x-[1px] active:translate-y-[1px]"
      >
        ✕
      </button>
    </div>
  );
}
