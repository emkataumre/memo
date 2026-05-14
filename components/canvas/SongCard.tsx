"use client";

import { useEffect, useRef, useState } from "react";
import type { Song } from "@/lib/types";
import type { LodTier } from "@/lib/canvas/lod";

const HOLD_MS = 600;
const MOVE_CANCEL = 6;

interface Props {
  song: Song;
  isToday: boolean;
  tier: LodTier;
  zoom: number;
  onMove: (id: string, x: number, y: number) => void;
  interactive: boolean;
  onDragStateChange: (active: boolean) => void;
}

type Phase = "idle" | "armed" | "dragging";

export default function SongCard({
  song,
  isToday,
  tier,
  zoom,
  onMove,
  interactive,
  onDragStateChange,
}: Props) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    pointerId: number;
    moved: boolean;
  } | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [embedded, setEmbedded] = useState(false);

  useEffect(() => {
    return () => {
      if (armTimer.current) clearTimeout(armTimer.current);
    };
  }, []);

  const x = pos?.x ?? song.pinned_x ?? 0;
  const y = pos?.y ?? song.pinned_y ?? 0;

  function clearArm() {
    if (armTimer.current) {
      clearTimeout(armTimer.current);
      armTimer.current = null;
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!interactive) return;
    if ((e.target as HTMLElement).dataset.role === "play") return;
    dragStart.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: song.pinned_x ?? 0,
      origY: song.pinned_y ?? 0,
      pointerId: e.pointerId,
      moved: false,
    };
    setPhase("armed");
    clearArm();
    armTimer.current = setTimeout(() => {
      armTimer.current = null;
      const el = elRef.current;
      if (el && dragStart.current) {
        try {
          el.setPointerCapture(dragStart.current.pointerId);
        } catch {
          /* pointer ended */
        }
      }
      setPhase("dragging");
      onDragStateChange(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(25);
      }
    }, HOLD_MS);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.startX;
    const dy = e.clientY - dragStart.current.startY;

    if (phase === "armed") {
      if (Math.abs(dx) > MOVE_CANCEL || Math.abs(dy) > MOVE_CANCEL) {
        dragStart.current.moved = true;
        clearArm();
        setPhase("idle");
        dragStart.current = null;
      }
      return;
    }

    if (phase !== "dragging") return;
    e.stopPropagation();
    setPos({
      x: dragStart.current.origX + dx / zoom,
      y: dragStart.current.origY + dy / zoom,
    });
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    clearArm();
    const wasDragging = phase === "dragging";
    if (wasDragging) {
      e.stopPropagation();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* may already be released */
      }
      if (pos) onMove(song.id, pos.x, pos.y);
      onDragStateChange(false);
    }
    dragStart.current = null;
    setPos(null);
    setPhase("idle");
  }

  // LOD 2: stripped card.
  if (tier === 2) {
    return (
      <div
        ref={elRef}
        style={{
          position: "absolute",
          left: x,
          top: y,
          transform: `rotate(${song.pinned_rotation ?? 0}deg)`,
          contain: "content",
        }}
        className="w-60 bg-ink border-2 border-ink p-0 flex"
      >
        <div
          className="w-20 aspect-square bg-ink-soft"
          style={{
            backgroundImage: song.album_art_url
              ? `url(${song.album_art_url})`
              : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="flex-1 bg-ink" />
      </div>
    );
  }

  const isSimplified = tier === 1;
  const dragging = phase === "dragging";
  const armed = phase === "armed";
  const canEmbed = tier === 0 && !dragging;

  return (
    <div
      ref={elRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `rotate(${song.pinned_rotation ?? 0}deg) ${
          dragging ? "scale(1.03)" : ""
        }`,
        contain: "content",
        willChange: dragging ? "transform" : undefined,
        touchAction: "none",
        zIndex: dragging ? 50 : undefined,
      }}
      className={`w-60 bg-ink text-paper border-2 border-ink ${
        dragging
          ? "shadow-[12px_12px_0_var(--coral)]"
          : "shadow-[6px_6px_0_var(--coral)]"
      } ${
        isToday || dragging
          ? "outline outline-4 outline-coral outline-offset-4"
          : ""
      } ${
        armed
          ? "outline outline-2 outline-coral outline-offset-2 opacity-95"
          : ""
      } cursor-grab ${dragging ? "cursor-grabbing" : ""} select-none flex`}
    >
      {embedded && canEmbed ? (
        <div className="w-full">
          <iframe
            src={`https://open.spotify.com/embed/track/${song.spotify_track_id}?utm_source=memo`}
            width="100%"
            height="152"
            allow="encrypted-media; autoplay; clipboard-write; fullscreen; picture-in-picture"
            allowFullScreen
            loading="lazy"
            className="block border-0"
          />
        </div>
      ) : (
        <>
          <div
            className="w-20 aspect-square flex-shrink-0 bg-ink-soft relative"
            style={{
              backgroundImage: song.album_art_url
                ? `url(${song.album_art_url})`
                : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            {canEmbed && (
              <button
                data-role="play"
                onClick={(e) => {
                  e.stopPropagation();
                  setEmbedded(true);
                }}
                aria-label="Play"
                className="absolute inset-0 flex items-center justify-center cursor-pointer"
              >
                <span className="w-9 h-9 bg-coral border-2 border-ink rounded-full flex items-center justify-center pl-1 text-ink font-bold text-sm shadow-[2px_2px_0_var(--ink)]">
                  ▶
                </span>
              </button>
            )}
          </div>
          <div className="flex-1 px-3 py-2.5 flex flex-col justify-between min-w-0">
            <div className="min-w-0">
              <div className="font-pixel text-[9px] tracking-widest uppercase text-coral">
                from {song.author}
              </div>
              <div className="font-display text-base leading-tight truncate mt-0.5">
                {song.track_name}
              </div>
              {!isSimplified && (
                <div className="font-mono text-[11px] text-paper/70 truncate">
                  {song.artist_name}
                </div>
              )}
            </div>
            {!isSimplified && (
              <div className="font-pixel text-[9px] tracking-widest uppercase text-paper/60">
                spotify
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
