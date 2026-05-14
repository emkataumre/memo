"use client";

import { useOutboxCount } from "@/lib/outbox/useOutbox";

// Bottom-left pill showing how many writes are waiting for the network.
// Hidden when the queue is empty.

export default function OutboxBadge() {
  const count = useOutboxCount();
  if (count <= 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-4 z-[180] pointer-events-none font-pixel text-[10px] tracking-widest uppercase bg-paper border-2 border-coral text-ink px-2 py-1 shadow-[3px_3px_0_var(--coral)] flex items-center gap-2 select-none"
    >
      <span className="inline-block w-1.5 h-1.5 bg-coral" />
      {count} izchakvat
    </div>
  );
}
