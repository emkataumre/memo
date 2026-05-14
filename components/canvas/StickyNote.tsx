"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { Note, NoteColor, NoteVariant } from "@/lib/types";
import type { LodTier } from "@/lib/canvas/lod";

const COLOR_BG: Record<NoteColor, string> = {
  lemon: "bg-lemon",
  pink: "bg-pink",
  sky: "bg-sky",
  mint: "bg-mint",
};

const HOLD_MS = 600; // longer hold makes accidental drags unlikely
const MOVE_CANCEL = 6; // any drift before HOLD fires drops the arm and pans

const DEFAULT_WIDTH = 208;
const DEFAULT_MIN_HEIGHT = 128;
const MIN_WIDTH = 208;
const MAX_WIDTH = 480;
const MIN_HEIGHT = 128;
const MAX_HEIGHT = 480;

// Typography ladder thresholds. Below LEAD, the whole body is mono.
// Between LEAD and ALL, the first paragraph becomes a Caprasimo
// headline and the rest stays mono. Past ALL, the entire body becomes
// the Caprasimo headline.
const LEAD_THRESHOLD = 240;
const ALL_THRESHOLD = 380;

type TypographyTier = "mono" | "lead" | "all";

function typographyTierFor(width: number): TypographyTier {
  if (width < LEAD_THRESHOLD) return "mono";
  if (width < ALL_THRESHOLD) return "lead";
  return "all";
}

interface Props {
  note: Note;
  isOwn: boolean;
  isToday: boolean;
  tier: LodTier;
  zoom: number;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, width: number, height: number) => void;
  interactive: boolean;
  onDragStateChange: (active: boolean) => void;
}

type Phase = "idle" | "armed" | "dragging";

function StickyNote({
  note,
  isOwn,
  isToday,
  tier,
  zoom,
  onMove,
  onResize,
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
  const resizeStart = useRef<{
    startX: number;
    startY: number;
    origW: number;
    origH: number;
    pointerId: number;
  } | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [resizing, setResizing] = useState(false);

  const baseWidth = note.width ?? DEFAULT_WIDTH;
  const baseHeight = note.height ?? DEFAULT_MIN_HEIGHT;
  const renderWidth = size?.w ?? baseWidth;
  const renderHeight = size?.h ?? baseHeight;
  const variant: NoteVariant = note.variant ?? "classic";
  const typoTier = typographyTierFor(renderWidth);

  // Scale typography off width so a 480-wide note has typography that
  // matches its footprint. Each tier picks its own base.
  const widthScale = renderWidth / DEFAULT_WIDTH;
  const monoBodyPx = 16 * widthScale;
  const leadDisplayPx =
    typoTier === "lead" ? 32 * (renderWidth / 320) : 60 * (renderWidth / 420);
  const restMonoPx = 15 * (renderWidth / 320);
  const allDisplayPx = 60 * (renderWidth / 420);
  const authorPx = 10 * widthScale;
  const simplifiedPx = 14 * widthScale;

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
      if (pos) onMove(note.id, pos.x, pos.y);
      onDragStateChange(false);
    }
    dragStart.current = null;
    setPos(null);
    setPhase("idle");
  }

  function onResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!isOwn || !interactive) return;
    e.stopPropagation();
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer ended */
    }
    resizeStart.current = {
      startX: e.clientX,
      startY: e.clientY,
      origW: baseWidth,
      origH: baseHeight,
      pointerId: e.pointerId,
    };
    setResizing(true);
    onDragStateChange(true);
  }

  function onResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const rs = resizeStart.current;
    if (!rs) return;
    e.stopPropagation();
    const dx = (e.clientX - rs.startX) / zoom;
    const dy = (e.clientY - rs.startY) / zoom;
    const nextW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, rs.origW + dx));
    const nextH = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, rs.origH + dy));
    setSize({ w: nextW, h: nextH });
  }

  function onResizePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const rs = resizeStart.current;
    if (!rs) return;
    e.stopPropagation();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* may already be released */
    }
    if (size) {
      onResize(note.id, Math.round(size.w), Math.round(size.h));
    }
    resizeStart.current = null;
    setSize(null);
    setResizing(false);
    onDragStateChange(false);
  }

  // LOD 2: footprint silhouette only. Variant doesn't matter; same
  // background as the variant's base color.
  if (tier === 2) {
    return (
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: renderWidth,
          minHeight: renderHeight,
          transform: `rotate(${note.rotation}deg)`,
          contain: "content",
        }}
        className={`border-2 border-ink ${COLOR_BG[note.color]}`}
      />
    );
  }

  const isSimplified = tier === 1;
  const dragging = phase === "dragging";
  const armed = phase === "armed";

  // Body content split. "Lead" tier uses the part before the first
  // newline as the headline; the rest stays mono. If there's no
  // newline, the whole body is the lead.
  const firstBreak = note.body.indexOf("\n");
  const leadText =
    firstBreak === -1 ? note.body : note.body.slice(0, firstBreak);
  const restText =
    firstBreak === -1 ? "" : note.body.slice(firstBreak + 1).trim();

  const bgClass =
    variant === "grain" || variant === "tape"
      ? "" // background painted inline below
      : COLOR_BG[note.color];

  const inlineBg =
    variant === "grain"
      ? {
          backgroundImage:
            "radial-gradient(circle, rgba(24,22,21,0.09) 1px, transparent 1.4px)",
          backgroundSize: "8px 8px",
          backgroundColor: `var(--${note.color})`,
        }
      : variant === "tape"
        ? { backgroundColor: "var(--paper)" }
        : undefined;

  // Quote variant uses Caprasimo for the entire body regardless of
  // tier — that's the whole point of choosing "quote" in the composer.
  const showStrip = variant === "strip" && !isSimplified;
  const showTape = variant === "tape" && !isSimplified;
  const showStamp = false; // reserved — not in this round
  const isQuote = variant === "quote";

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
        width: renderWidth,
        minHeight: renderHeight,
        transform: `rotate(${note.rotation}deg) ${
          dragging ? "scale(1.04)" : ""
        }`,
        contain: "content",
        contentVisibility: "auto",
        containIntrinsicSize: `auto ${renderWidth}px ${renderHeight}px`,
        willChange:
          dragging || resizing ? "transform, width, height" : undefined,
        touchAction: "none",
        zIndex: dragging || resizing ? 50 : undefined,
        ...inlineBg,
      }}
      className={`border-2 border-ink ${bgClass} ${
        dragging
          ? "shadow-[10px_10px_0_var(--ink)]"
          : "shadow-[6px_6px_0_var(--ink)]"
      } font-mono relative ${
        isToday || dragging
          ? "outline outline-4 outline-coral outline-offset-4"
          : ""
      } ${
        armed
          ? "outline outline-2 outline-coral outline-offset-2 opacity-95"
          : ""
      } ${
        resizing ? "outline outline-2 outline-coral outline-offset-2" : ""
      } ${isOwn ? "cursor-grab" : "cursor-default"} ${
        dragging ? "cursor-grabbing" : ""
      } select-none ${
        showStrip ? "pt-9" : showTape ? "pt-7" : "pt-5"
      } px-5 pb-5`}
    >
      {showStrip && (
        <div
          className="absolute top-0 left-0 right-0 bg-coral text-ink border-b-2 border-ink flex items-center justify-between px-3 font-pixel uppercase tracking-widest"
          style={{ height: 28, fontSize: 9 }}
        >
          <span>{note.author}</span>
          <span>{formatStamp(note.created_at)}</span>
        </div>
      )}

      {showTape && (
        <div
          aria-hidden
          className="absolute"
          style={{
            top: -10,
            left: "50%",
            transform: "translateX(-50%) rotate(-3.5deg)",
            width: 96,
            height: 22,
            background:
              "repeating-linear-gradient(45deg, rgba(255,92,57,0.6) 0 8px, rgba(255,92,57,0.4) 8px 16px)",
            borderLeft: "1px dashed rgba(24,22,21,0.35)",
            borderRight: "1px dashed rgba(24,22,21,0.35)",
            boxShadow: "0 2px 4px rgba(24,22,21,0.18)",
          }}
        />
      )}

      {isSimplified ? (
        <div
          className="line-clamp-2 whitespace-pre-wrap break-words"
          style={{ fontSize: simplifiedPx }}
        >
          {note.body}
        </div>
      ) : isQuote ? (
        <div className="pr-2">
          <p
            className="whitespace-pre-wrap break-words m-0"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: allDisplayPx,
              lineHeight: 0.98,
              letterSpacing: "-0.012em",
            }}
          >
            <span style={{ color: "var(--coral)", marginRight: 4 }}>“</span>
            {note.body}
          </p>
          <div
            className="italic mt-3 text-ink-soft"
            style={{ fontSize: restMonoPx }}
          >
            — {note.author}
          </div>
        </div>
      ) : typoTier === "all" ? (
        <>
          <p
            className="whitespace-pre-wrap break-words pr-2 m-0"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: allDisplayPx,
              lineHeight: 0.98,
              letterSpacing: "-0.012em",
            }}
          >
            {note.body}
          </p>
          {!showStrip && (
            <span
              className="absolute bottom-2.5 right-3 font-pixel uppercase tracking-widest opacity-70"
              style={{ fontSize: authorPx }}
            >
              {note.author}
            </span>
          )}
        </>
      ) : typoTier === "lead" ? (
        <>
          <p
            className="whitespace-pre-wrap break-words pr-2 m-0"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: leadDisplayPx,
              lineHeight: 1,
              letterSpacing: "-0.01em",
            }}
          >
            {leadText}
          </p>
          {restText && (
            <div
              className="whitespace-pre-wrap break-words pr-2 mt-3"
              style={{ fontSize: restMonoPx, lineHeight: 1.45 }}
            >
              {restText}
            </div>
          )}
          {!showStrip && (
            <span
              className="absolute bottom-2.5 right-3 font-pixel uppercase tracking-widest opacity-70"
              style={{ fontSize: authorPx }}
            >
              {note.author}
            </span>
          )}
        </>
      ) : (
        // mono tier
        <>
          <div
            className="whitespace-pre-wrap break-words pr-2"
            style={{ fontSize: monoBodyPx, lineHeight: 1.45 }}
          >
            {note.body}
          </div>
          {!showStrip && (
            <span
              className="absolute bottom-2.5 right-3 font-pixel uppercase tracking-widest opacity-70"
              style={{ fontSize: authorPx }}
            >
              {note.author}
            </span>
          )}
        </>
      )}

      {isOwn && !isSimplified && interactive && (
        <div
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
          aria-label="promeni razmera"
          className="absolute bottom-0 right-0 w-7 h-7 flex items-end justify-end pb-1 pr-1 cursor-nwse-resize"
          style={{ touchAction: "none" }}
        >
          <svg viewBox="0 0 12 12" className="w-3.5 h-3.5 text-ink/60">
            <path
              d="M 11 2 L 2 11 M 11 5 L 5 11 M 11 8 L 8 11"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </div>
      )}

      {showStamp /* future */ && null}
    </div>
  );
}

export default memo(StickyNote);

function formatStamp(iso: string): string {
  const d = new Date(iso);
  const months = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${months[d.getMonth()]} · ${hh}:${mm}`;
}
