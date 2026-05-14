"use client";

import { useCallback, useState, type RefObject } from "react";
import { useGesture } from "@use-gesture/react";

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function zoomAtPoint(
  v: Viewport,
  newZoom: number,
  cx: number,
  cy: number,
): Viewport {
  const clamped = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
  const factor = clamped / v.zoom;
  return {
    x: cx - (cx - v.x) * factor,
    y: cy - (cy - v.y) * factor,
    zoom: clamped,
  };
}

export const ZOOM_BOUNDS = { min: MIN_ZOOM, max: MAX_ZOOM };

export function usePanZoom(
  targetRef: RefObject<HTMLElement | null>,
  externalDragRef: RefObject<boolean>,
  initial: Viewport = { x: 0, y: 0, zoom: 1 },
) {
  const [viewport, setViewport] = useState<Viewport>(initial);

  useGesture(
    {
      // Pan with one finger / mouse drag — works from anywhere inside the
      // canvas, including on top of notes/cards. Cards arm their own
      // long-press timer; once a card enters drag mode it flips the
      // shared ref so this handler cancels.
      onDrag: ({ delta: [dx, dy], cancel }) => {
        if (externalDragRef.current) {
          cancel();
          return;
        }
        setViewport((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      },

      // Plain scroll wheel → zoom. Pinch on touch is intentionally
      // disabled (controls handle zoom; pinch on iOS Safari is unreliable).
      onWheel: ({ delta: [, dy], event, ctrlKey, last }) => {
        if (last) return; // synthesized end event; currentTarget may be null
        if (ctrlKey) return; // trackpad pinch — also disabled
        const root = targetRef.current;
        if (!root) return;
        event.preventDefault();
        const wheelEvent = event as WheelEvent;
        const rect = root.getBoundingClientRect();
        const cx = wheelEvent.clientX - rect.left;
        const cy = wheelEvent.clientY - rect.top;
        const clampedDy = Math.max(-80, Math.min(80, dy));
        const factor = Math.exp(-clampedDy * 0.0018);
        setViewport((v) => zoomAtPoint(v, v.zoom * factor, cx, cy));
      },
    },
    {
      target: targetRef,
      eventOptions: { passive: false },
      drag: { filterTaps: true, threshold: 6 },
    },
  );


  const animateTo = useCallback(
    (target: Viewport, durationMs = 400) => {
      const start = performance.now();
      const from = viewport;
      function step(now: number) {
        const t = Math.min(1, (now - start) / durationMs);
        const ease = 1 - Math.pow(1 - t, 3);
        setViewport({
          x: from.x + (target.x - from.x) * ease,
          y: from.y + (target.y - from.y) * ease,
          zoom: from.zoom + (target.zoom - from.zoom) * ease,
        });
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    },
    [viewport],
  );

  return { viewport, setViewport, animateTo };
}
