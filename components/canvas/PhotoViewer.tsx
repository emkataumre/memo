"use client";

import type { Photo } from "@/lib/types";
import { usePhotoUrl } from "@/lib/photos/usePhotoUrls";

interface Props {
  photo: Photo | null;
  onClose: () => void;
}

export default function PhotoViewer({ photo, onClose }: Props) {
  const urls = usePhotoUrl(photo?.id ?? null);
  if (!photo || !urls?.full_url) return null;

  return (
    <div
      className="fixed inset-0 z-[300] bg-ink/85 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="max-w-full max-h-full bg-white border-2 border-paper shadow-[12px_12px_0_var(--paper)] p-3 pb-10 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={urls.full_url}
          alt=""
          className="max-w-[80vw] max-h-[75vh] object-contain"
        />
        <div className="absolute bottom-2.5 left-4 right-4 flex justify-between font-pixel text-[10px] uppercase tracking-widest text-ink-soft">
          <span className="text-ink">{photo.author}</span>
          <span>{photo.taken_at.slice(0, 16).replace("T", " ")}</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute -top-3 -right-3 w-9 h-9 bg-paper border-2 border-ink flex items-center justify-center font-pixel text-sm cursor-pointer active:translate-x-[2px] active:translate-y-[2px]"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
