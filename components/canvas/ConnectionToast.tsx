"use client";

import { useEffect, useState } from "react";

// Bottom-center toast that surfaces a Realtime disconnect. Held back
// for the first SHOW_AFTER_MS so transient blips (sub-second reconnects)
// don't flash. The render gate is `connected || !shouldShow` — if the
// channel is currently connected at render time, the pill is hidden
// regardless of whether the delayed setShouldShow(false) has been
// flushed yet. That belt-and-suspenders avoids the failure mode where
// the shouldShow flag stayed `true` after a reconnect.

interface Props {
  connected: boolean;
}

const SHOW_AFTER_MS = 1500;

export default function ConnectionToast({ connected }: Props) {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    if (connected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShouldShow(false);
      return;
    }
    const t = setTimeout(() => setShouldShow(true), SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [connected]);

  if (connected || !shouldShow) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] pointer-events-none"
    >
      <div className="font-pixel text-[10px] tracking-widest uppercase bg-ink text-paper px-3 py-2 border-2 border-coral shadow-[3px_3px_0_var(--coral)] flex items-center gap-2 select-none">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-coral animate-pulse" />
        reconnecting…
      </div>
    </div>
  );
}
