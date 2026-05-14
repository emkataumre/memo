"use client";

import { useEffect, useRef, useState } from "react";
import type { Photo } from "@/lib/types";
import type { LodTier } from "@/lib/canvas/lod";
import { usePhotoUrl } from "@/lib/photos/usePhotoUrls";

const HOLD_MS = 600;
const MOVE_CANCEL = 6;

interface Props {
  photo: Photo;
  isToday: boolean;
  tier: LodTier;
  zoom: number;
  onMove: (id: string, x: number, y: number) => void;
  onTap: (photo: Photo) => void;
  interactive: boolean;
  onDragStateChange: (active: boolean) => void;
}

type Phase = "idle" | "armed" | "dragging";

export default function PhotoCard({
  photo,
  isToday,
  tier,
  zoom,
  onMove,
  onTap,
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
  const urls = usePhotoUrl(photo.id);
  const thumbUrl = urls?.thumb_url;

  useEffect(() => {
    return () => {
      if (armTimer.current) clearTimeout(armTimer.current);
    };
  }, []);

  const x = pos?.x ?? photo.pinned_x ?? 0;
  const y = pos?.y ?? photo.pinned_y ?? 0;

  function clearArm() {
    if (armTimer.current) {
      clearTimeout(armTimer.current);
      armTimer.current = null;
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!interactive) return;
    // Do not stopPropagation / capture yet — let swipes pan the canvas.
    dragStart.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: photo.pinned_x ?? 0,
      origY: photo.pinned_y ?? 0,
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
        // Cancel arm so the viewport gesture takes the swipe.
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
    const ds = dragStart.current;
    const wasDragging = phase === "dragging";

    if (wasDragging) {
      e.stopPropagation();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* may already be released */
      }
      if (pos) onMove(photo.id, pos.x, pos.y);
      onDragStateChange(false);
    } else if (ds && !ds.moved) {
      // Pointer down → up without drift and without long-press → tap.
      e.stopPropagation();
      onTap(photo);
    }

    dragStart.current = null;
    setPos(null);
    setPhase("idle");
  }

  if (tier === 2) {
    return (
      <div
        ref={elRef}
        style={{
          position: "absolute",
          left: x,
          top: y,
          transform: `rotate(${photo.pinned_rotation ?? 0}deg)`,
          contain: "content",
        }}
        className="w-52 bg-white border-2 border-ink p-3.5"
      >
        <div
          className="w-full aspect-square bg-ink/10"
          style={{
            backgroundImage: thumbUrl ? `url(${thumbUrl})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      </div>
    );
  }

  const isSimplified = tier === 1;
  const dragging = phase === "dragging";
  const armed = phase === "armed";

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
        transform: `rotate(${photo.pinned_rotation ?? 0}deg) ${
          dragging ? "scale(1.03)" : ""
        }`,
        contain: "content",
        willChange: dragging ? "transform" : undefined,
        touchAction: "none",
        zIndex: dragging ? 50 : undefined,
      }}
      className={`w-52 bg-white border-2 border-ink ${
        dragging
          ? "shadow-[12px_12px_0_var(--ink)]"
          : "shadow-[8px_8px_0_var(--ink)]"
      } p-3.5 pb-11 ${
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
        className="w-full aspect-square bg-ink/10"
        style={{
          backgroundImage: thumbUrl ? `url(${thumbUrl})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      {!isSimplified && (
        <div className="absolute bottom-2.5 left-3.5 right-3.5 flex justify-between font-pixel text-[10px] uppercase tracking-widest text-ink-soft">
          <span className="text-ink">{photo.author}</span>
          <span>{formatTakenAt(photo.taken_at)}</span>
        </div>
      )}
    </div>
  );
}

function formatTakenAt(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
