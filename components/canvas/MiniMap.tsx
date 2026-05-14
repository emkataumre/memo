"use client";

import { useMemo } from "react";
import type { Note, NoteColor, Photo, Song } from "@/lib/types";
import type { Viewport } from "@/lib/canvas/usePanZoom";

const MAP_W = 140;
const MAP_H = 100;
const PAD = 8;
const NOTE_W = 208;
const NOTE_H = 130;
const ITEM_PADDING = 0.15; // 15% breathing room around the items bbox

const COLOR_HEX: Record<NoteColor, string> = {
  lemon: "#F4D03F",
  pink: "#FF6FA8",
  sky: "#6EC1FF",
  mint: "#8FE0A8",
};

interface Props {
  notes: Note[];
  photos: Photo[];
  songs: Song[];
  viewport: Viewport;
  vpSize: { width: number; height: number } | null;
}

export default function MiniMap({
  notes,
  photos,
  songs,
  viewport,
  vpSize,
}: Props) {
  const { dots, viewRect, hasItems } = useMemo(() => {
    if (!vpSize) {
      return { dots: [], viewRect: null, hasItems: false };
    }
    const items = [
      ...notes.map((n) => ({ x: n.x, y: n.y, color: COLOR_HEX[n.color] })),
      ...photos.map((p) => ({
        x: p.pinned_x ?? 0,
        y: p.pinned_y ?? 0,
        color: "#FF5C39",
      })),
      ...songs.map((s) => ({
        x: s.pinned_x ?? 0,
        y: s.pinned_y ?? 0,
        color: "#181615",
      })),
    ];

    if (items.length === 0) {
      return { dots: [], viewRect: null, hasItems: false };
    }

    // Items bbox — pad first so single items / clusters don't sit flush.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const it of items) {
      if (it.x < minX) minX = it.x;
      if (it.y < minY) minY = it.y;
      if (it.x + NOTE_W > maxX) maxX = it.x + NOTE_W;
      if (it.y + NOTE_H > maxY) maxY = it.y + NOTE_H;
    }
    const padX = (maxX - minX) * ITEM_PADDING || NOTE_W * 0.5;
    const padY = (maxY - minY) * ITEM_PADDING || NOTE_H * 0.5;
    minX -= padX;
    minY -= padY;
    maxX += padX;
    maxY += padY;

    // Union with viewport bbox so the minimap "tracks" zoom/pan — the
    // rect always stays within the map and the items shrink as you
    // zoom out, just like a real overview.
    const vMinX = -viewport.x / viewport.zoom;
    const vMinY = -viewport.y / viewport.zoom;
    const vMaxX = vMinX + vpSize.width / viewport.zoom;
    const vMaxY = vMinY + vpSize.height / viewport.zoom;
    minX = Math.min(minX, vMinX);
    minY = Math.min(minY, vMinY);
    maxX = Math.max(maxX, vMaxX);
    maxY = Math.max(maxY, vMaxY);

    const w = maxX - minX;
    const h = maxY - minY;
    const s = Math.min((MAP_W - 2 * PAD) / w, (MAP_H - 2 * PAD) / h);

    // Centre the union so an aspect mismatch doesn't push everything
    // into a corner.
    const offX = (MAP_W - w * s) / 2;
    const offY = (MAP_H - h * s) / 2;

    const project = (x: number, y: number) => ({
      mx: (x - minX) * s + offX,
      my: (y - minY) * s + offY,
    });

    const projectedDots = items.map((it) => ({
      ...project(it.x, it.y),
      color: it.color,
    }));

    const tl = project(vMinX, vMinY);
    const br = project(vMaxX, vMaxY);

    return {
      dots: projectedDots,
      viewRect: {
        x: tl.mx,
        y: tl.my,
        w: br.mx - tl.mx,
        h: br.my - tl.my,
      },
      hasItems: true,
    };
  }, [notes, photos, songs, viewport, vpSize]);

  if (!hasItems) return null;

  return (
    <div
      className="fixed right-4 top-[60px] z-40 bg-paper border-2 border-ink shadow-[4px_4px_0_var(--ink)] touch-none select-none pointer-events-none overflow-hidden"
      style={{ width: MAP_W, height: MAP_H }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(24,22,21,0.08) 0.6px, transparent 0.6px)",
          backgroundSize: "6px 6px",
        }}
      />
      {dots.map((d, i) => (
        <div
          key={i}
          className="absolute border border-ink"
          style={{
            left: d.mx - 2,
            top: d.my - 2,
            width: 4,
            height: 4,
            background: d.color,
          }}
        />
      ))}
      {viewRect && (
        <div
          className="absolute"
          style={{
            left: viewRect.x,
            top: viewRect.y,
            width: viewRect.w,
            height: viewRect.h,
            border: "2px solid var(--coral)",
            boxShadow: "0 0 0 1px rgba(255,92,57,0.3)",
          }}
        />
      )}
      <div className="absolute -bottom-[18px] left-0 font-pixel text-[9px] tracking-widest uppercase text-ink-soft">
        map
      </div>
    </div>
  );
}
