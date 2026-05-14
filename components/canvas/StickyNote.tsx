"use client";

import { useEffect, useRef, useState } from "react";
import type { Note, NoteColor } from "@/lib/types";
import type { LodTier } from "@/lib/canvas/lod";

const COLOR_BG: Record<NoteColor, string> = {
  lemon: "bg-lemon",
  pink: "bg-pink",
  sky: "bg-sky",
  mint: "bg-mint",
};

const HOLD_MS = 600; // longer hold makes accidental drags unlikely
const MOVE_CANCEL = 6; // any drift before HOLD fires drops the arm and pans

interface Props {
  note: Note;
  isOwn: boolean;
  isToday: boolean;
  tier: LodTier;
  zoom: number;
  onMove: (id: string, x: number, y: number) => void;
  interactive: boolean;
  onDragStateChange: (active: boolean) => void;
}

type Phase = "idle" | "armed" | "dragging";

export default function StickyNote({
  note,
  isOwn,
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
  } | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    return () => {
      if (armTimer.current) clearTimeout(armTimer.current);
    };
  }, []);

  const x = pos?.x ?? note.x;
  const y = pos?.y ?? note.y;

  function clearArm() {
    if (armTimer.current) {
      clearTimeout(armTimer.current);
      armTimer.current = null;
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!isOwn || !interactive) return;
    // Intentionally NO stopPropagation and NO pointer capture here.
    // The viewport's drag gesture should still see this event so that
    // if the user swipes (instead of holding), the canvas pans normally.
    // We only steal control if the long-press timer fires.
    dragStart.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: note.x,
      origY: note.y,
      pointerId: e.pointerId,
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
          /* pointer may have ended already */
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
        // User is swiping — drop the long-press intent and let the
        // viewport gesture take this drag for panning.
        clearArm();
        setPhase("idle");
        dragStart.current = null;
      }
      return;
    }

    if (phase !== "dragging") return;
    // We've taken control. Block bubbling so the viewport doesn't pan.
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
      if (pos) onMove(note.id, pos.x, pos.y);
      onDragStateChange(false);
    }
    dragStart.current = null;
    setPos(null);
    setPhase("idle");
  }

  // LOD 2: same footprint as full note, stripped content.
  if (tier === 2) {
    return (
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          transform: `rotate(${note.rotation}deg)`,
          contain: "content",
        }}
        className={`w-52 min-h-32 border-2 border-ink ${COLOR_BG[note.color]}`}
      />
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
        transform: `rotate(${note.rotation}deg) ${
          dragging ? "scale(1.04)" : ""
        }`,
        contain: "content",
        willChange: dragging ? "transform" : undefined,
        touchAction: "none",
        zIndex: dragging ? 50 : undefined,
      }}
      className={`w-52 p-5 border-2 border-ink ${COLOR_BG[note.color]} ${
        dragging
          ? "shadow-[10px_10px_0_var(--ink)]"
          : "shadow-[6px_6px_0_var(--ink)]"
      } font-mono text-base min-h-32 ${
        isToday || dragging
          ? "outline outline-4 outline-coral outline-offset-4"
          : ""
      } ${
        armed ? "outline outline-2 outline-coral outline-offset-2 opacity-95" : ""
      } ${isOwn ? "cursor-grab" : "cursor-default"} ${
        dragging ? "cursor-grabbing" : ""
      } select-none`}
    >
      {isSimplified ? (
        <div className="line-clamp-2 text-sm whitespace-pre-wrap break-words">
          {note.body}
        </div>
      ) : (
        <>
          <div className="whitespace-pre-wrap break-words pr-2">
            {note.body}
          </div>
          <span className="absolute bottom-2.5 right-3 font-pixel text-[10px] uppercase tracking-widest opacity-70">
            {note.author}
          </span>
        </>
      )}
    </div>
  );
}
