"use client";

import { useEffect, useMemo, useState } from "react";
import type { Photo } from "@/lib/types";
import { minutesUntilNextReveal } from "@/lib/memo-day";

interface Props {
  onEnterZen: () => void;
  onOpenRoll: () => void;
  onOpenReveal: () => void;
  onOpenArchive: () => void;
  photos: Photo[];
}

export default function TopBar({
  onEnterZen,
  onOpenRoll,
  onOpenReveal,
  onOpenArchive,
  photos,
}: Props) {
  const lockedCount = photos.filter((p) => p.locked).length;
  const tonightsCount = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return photos.filter(
      (p) => !p.locked && Date.parse(p.reveal_at) > cutoff,
    ).length;
  }, [photos]);
  const tonightsUnpinned = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return photos.filter(
      (p) =>
        !p.locked &&
        p.pinned_at === null &&
        Date.parse(p.reveal_at) > cutoff,
    ).length;
  }, [photos]);

  return (
    <header className="sticky top-0 h-11 bg-ink text-paper flex items-center px-3 z-50 border-b-2 border-ink gap-2">
      <span className="font-display text-2xl text-coral leading-none flex-shrink-0">
        memo
      </span>
      <div className="flex-1 flex items-center justify-center">
        {lockedCount > 0 ? (
          <Countdown onClick={onOpenRoll} />
        ) : tonightsCount > 0 ? (
          <RevealChip
            unpinned={tonightsUnpinned}
            total={tonightsCount}
            onClick={onOpenReveal}
          />
        ) : null}
      </div>
      <button
        onClick={onOpenArchive}
        aria-label="Open archive"
        className="w-8 h-8 border-2 border-paper flex items-center justify-center cursor-pointer active:bg-paper active:text-ink flex-shrink-0"
      >
        <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
          <rect
            x="2"
            y="3"
            width="12"
            height="10"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M2 6 L14 6"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M6 9 L10 9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <button
        onClick={onEnterZen}
        aria-label="Enter zen mode"
        className="font-pixel text-xs tracking-widest uppercase border-2 border-paper px-2.5 py-1 flex items-center gap-2 cursor-pointer active:bg-paper active:text-ink select-none flex-shrink-0"
      >
        <svg viewBox="0 0 14 14" className="w-3 h-3" fill="none">
          <circle
            cx="7"
            cy="7"
            r="5.5"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <circle cx="7" cy="7" r="1.6" fill="currentColor" />
        </svg>
        zen
      </button>
    </header>
  );
}

function Countdown({ onClick }: { onClick: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const minutes = minutesUntilNextReveal();
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  const label =
    hh > 0
      ? `${hh}H ${String(mm).padStart(2, "0")}M`
      : `${String(mm).padStart(2, "0")}M`;

  return (
    <button
      onClick={onClick}
      aria-label="View today's roll"
      className="font-pixel text-[11px] tracking-widest uppercase border-2 border-coral text-coral px-2 py-0.5 flex items-center gap-2 cursor-pointer active:bg-coral active:text-ink"
    >
      <svg viewBox="0 0 14 14" className="w-2.5 h-2.5" fill="none">
        <rect
          x="3"
          y="6"
          width="8"
          height="6"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M5 6 V 4 a 2 2 0 0 1 4 0 V 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      {label}
    </button>
  );
}

function RevealChip({
  unpinned,
  total,
  onClick,
}: {
  unpinned: number;
  total: number;
  onClick: () => void;
}) {
  const showCount = unpinned > 0 ? unpinned : total;
  return (
    <button
      onClick={onClick}
      aria-label="View tonight's reveal"
      className="font-pixel text-[11px] tracking-widest uppercase border-2 border-ink bg-coral text-ink px-2 py-0.5 flex items-center gap-2 cursor-pointer active:translate-x-[1px] active:translate-y-[1px]"
    >
      <span className="inline-block w-1.5 h-1.5 bg-ink" />
      today · {showCount} →
    </button>
  );
}
