"use client";

import { useEffect, useState } from "react";

// Bottom-center toast that surfaces a Realtime disconnect. Hidden for
// the first SHOW_AFTER_MS so transient blips (millisecond reconnects)
// don't flash a banner. Auto-hides as soon as the channel reports
// `connected` again.

interface Props {
  connected: boolean;
}

const SHOW_AFTER_MS = 1500;

export default function ConnectionToast({ connected }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (connected) {
      // Reconnected — hide immediately. setState inside an effect is
      // intentional here (we're synchronising UI to an external prop,
      // which is exactly what useEffect is for).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [connected]);

  if (!visible) return null;

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
