"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { Song } from "@/lib/types";
import type { LodTier } from "@/lib/canvas/lod";
import { useZoomRef } from "@/lib/canvas/zoom-context";

const HOLD_MS = 600;
const MOVE_CANCEL = 6;

interface Props {
  song: Song;
  isToday: boolean;
  tier: LodTier;
  onMove: (id: string, x: number, y: number) => void;
  interactive: boolean;
  onDragStateChange: (active: boolean) => void;
}

type Phase = "idle" | "armed" | "dragging";

function SongCard({
  song,
  isToday,
  tier,
  onMove,
  interactive,
  onDragStateChange,
}: Props) {
  const zoomRef = useZoomRef();
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
  // Cassette flips on tap to reveal the player on the back face.
  const [flipped, setFlipped] = useState(false);

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
    const z = zoomRef.current || 1;
    setPos({
      x: dragStart.current.origX + dx / z,
      y: dragStart.current.origY + dy / z,
    });
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    clearArm();
    const ds = dragStart.current;
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
    } else if (ds && !ds.moved && phase === "armed") {
      // Quick tap (released before HOLD_MS, no drift) — flip the cassette.
      e.stopPropagation();
      setFlipped((f) => !f);
    }

    dragStart.current = null;
    setPos(null);
    setPhase("idle");
  }

  // LOD 2: stripped silhouette of the cassette body, no flip.
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
        className="w-[280px] h-[160px] bg-ink border-2 border-ink"
      />
    );
  }

  const isSimplified = tier === 1;
  const dragging = phase === "dragging";
  const armed = phase === "armed";
  // Spotify iframe is heavy; only mount when fully visible on the back face
  // and not in the middle of a drag (drags cancel pointer events on the
  // iframe and the WebView reload is expensive).
  const showEmbed = flipped && tier === 0 && !dragging;

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
        width: 280,
        height: 160,
        transform: `rotate(${song.pinned_rotation ?? 0}deg) ${
          dragging ? "scale(1.03)" : ""
        }`,
        contain: "content",
        contentVisibility: "auto",
        containIntrinsicSize: "auto 280px 160px",
        willChange: dragging ? "transform" : undefined,
        touchAction: "none",
        zIndex: dragging ? 50 : undefined,
        perspective: "1000px",
      }}
      className={`${
        isToday || dragging
          ? "outline outline-4 outline-coral outline-offset-4"
          : ""
      } ${
        armed
          ? "outline outline-2 outline-coral outline-offset-2 opacity-95"
          : ""
      } cursor-grab ${dragging ? "cursor-grabbing" : ""} select-none`}
    >
      <div
        className="relative w-full h-full transition-transform duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Front: cassette face */}
        <CassetteFront
          song={song}
          isSimplified={isSimplified}
          dragging={dragging}
        />
        {/* Back: album art + Spotify embed */}
        <CassetteBack
          song={song}
          showEmbed={showEmbed}
          dragging={dragging}
          onFlipBack={() => setFlipped(false)}
        />
      </div>
    </div>
  );
}

export default memo(SongCard);

function CassetteFront({
  song,
  isSimplified,
  dragging,
}: {
  song: Song;
  isSimplified: boolean;
  dragging: boolean;
}) {
  return (
    <div
      className="absolute inset-0 border-2 border-ink bg-ink text-paper flex flex-col"
      style={{
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        boxShadow: dragging
          ? "12px 12px 0 var(--coral)"
          : "6px 6px 0 var(--coral)",
      }}
    >
      {/* Paper label */}
      <div className="bg-paper text-ink m-2 mb-1 px-2.5 py-1.5 border border-ink relative flex-shrink-0">
        {/* Two little screw circles in the label corners */}
        <span className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-ink/40" />
        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-ink/40" />
        <div className="font-pixel text-[8px] tracking-widest uppercase text-coral">
          from {song.author}
        </div>
        <div className="font-display text-sm leading-tight truncate">
          {song.track_name}
        </div>
        {!isSimplified && (
          <div className="font-mono text-[10px] text-ink-soft truncate">
            {song.artist_name}
          </div>
        )}
      </div>

      {/* Reel deck */}
      <div className="flex-1 mx-2 mb-2 bg-ink-deep border border-ink/60 relative flex items-center justify-around overflow-hidden">
        {/* Tape strip connecting reels */}
        <span className="absolute top-1/2 left-6 right-6 h-[2px] bg-paper/30 -translate-y-1/2" />
        <Reel />
        <Reel />
        {/* Bottom screws */}
        <span className="absolute bottom-1 left-1 w-1.5 h-1.5 rounded-full bg-paper/30" />
        <span className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-paper/30" />
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 font-pixel text-[7px] tracking-widest uppercase text-paper/40">
          tap to play
        </span>
      </div>
    </div>
  );
}

function Reel() {
  return (
    <svg viewBox="0 0 36 36" className="w-9 h-9 text-paper/70">
      <circle
        cx="18"
        cy="18"
        r="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="18" cy="18" r="4" fill="currentColor" />
      {/* Six spokes (holes) */}
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <circle
          key={deg}
          cx={18 + Math.cos((deg * Math.PI) / 180) * 9}
          cy={18 + Math.sin((deg * Math.PI) / 180) * 9}
          r="1.6"
          fill="currentColor"
          opacity="0.6"
        />
      ))}
    </svg>
  );
}

function CassetteBack({
  song,
  showEmbed,
  dragging,
  onFlipBack,
}: {
  song: Song;
  showEmbed: boolean;
  dragging: boolean;
  onFlipBack: () => void;
}) {
  return (
    <div
      className="absolute inset-0 border-2 border-ink bg-ink text-paper flex overflow-hidden"
      style={{
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        transform: "rotateY(180deg)",
        boxShadow: dragging
          ? "12px 12px 0 var(--coral)"
          : "6px 6px 0 var(--coral)",
      }}
    >
      {showEmbed ? (
        <iframe
          src={`https://open.spotify.com/embed/track/${song.spotify_track_id}?utm_source=memo`}
          width="100%"
          height="100%"
          allow="encrypted-media; autoplay; clipboard-write; fullscreen; picture-in-picture"
          allowFullScreen
          loading="lazy"
          className="block border-0 w-full h-full"
        />
      ) : (
        <>
          <div
            className="h-full aspect-square flex-shrink-0 bg-ink-soft"
            style={{
              backgroundImage: song.album_art_url
                ? `url(${song.album_art_url})`
                : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <div className="flex-1 px-3 py-2.5 flex flex-col justify-between min-w-0">
            <div className="min-w-0">
              <div className="font-pixel text-[9px] tracking-widest uppercase text-coral">
                side b
              </div>
              <div className="font-display text-base leading-tight truncate mt-0.5">
                {song.track_name}
              </div>
              <div className="font-mono text-[10px] text-paper/70 truncate">
                {song.artist_name}
              </div>
            </div>
            <div className="font-pixel text-[8px] tracking-widest uppercase text-paper/60">
              tap flip arrow →
            </div>
          </div>
        </>
      )}

      {/* Always-on flip-back button. Sits above the iframe via z-index and
          stops pointer propagation so the long-press drag never arms. */}
      <button
        aria-label="Oburni kasetata"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onFlipBack();
        }}
        className="absolute top-1.5 right-1.5 z-20 w-7 h-7 bg-coral border-2 border-ink text-ink font-pixel text-sm flex items-center justify-center cursor-pointer active:translate-x-[1px] active:translate-y-[1px] shadow-[2px_2px_0_var(--ink)]"
      >
        ⇆
      </button>
    </div>
  );
}
