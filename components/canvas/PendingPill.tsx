"use client";

import { useMemo } from "react";
import type { Photo } from "@/lib/types";
import { isLocked } from "@/lib/photos/derive";

interface Props {
  photos: Photo[];
  onOpenReveal: () => void;
}

/**
 * Bottom-center entry to the reveal sheet. Visible while any photo has
 * revealed in the last 24h (the "current" reveal cycle), whether pinned
 * or not. Label adapts: "X to review" while unpinned remain, otherwise
 * "view tonight".
 */
export default function PendingPill({ photos, onOpenReveal }: Props) {
  const tonightsPhotos = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return photos.filter(
      (p) => !isLocked(p) && Date.parse(p.reveal_at) > cutoff,
    );
  }, [photos]);

  if (tonightsPhotos.length === 0) return null;

  const unpinned = tonightsPhotos.filter((p) => p.pinned_at === null).length;
  const label =
    unpinned > 0 ? `${unpinned} za pregled →` : "vij dnes →";

  return (
    <button
      onClick={onOpenReveal}
      className="fixed bottom-28 left-1/2 -translate-x-1/2 z-40 bg-coral border-2 border-ink shadow-[5px_5px_0_var(--ink)] px-4 py-2.5 font-pixel text-xs tracking-widest uppercase text-ink cursor-pointer active:translate-x-[3px] active:translate-y-[3px] active:shadow-none flex items-center gap-2"
    >
      <span className="inline-block w-2 h-2 bg-ink"></span>
      dnes · {label}
    </button>
  );
}
