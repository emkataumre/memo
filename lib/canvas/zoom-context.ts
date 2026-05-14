"use client";

import { createContext, useContext } from "react";

// Mutable zoom ref shared from CanvasClient down to every card. The
// pointer-handler math needs the live zoom value to translate screen
// deltas into canvas-space coordinates, but cards must NOT take zoom as
// a prop — that would change every RAF frame during pan/zoom and break
// React.memo on every visible card 60× per second.
//
// Putting the value behind a ref means:
//   - the context value (the ref object) is stable, so consumers never
//     re-render via context invalidation;
//   - cards read `.current` inside their pointer handlers, picking up
//     the latest zoom only when actually needed (i.e. during a drag).

export type ZoomRef = { current: number };

export const ZoomContext = createContext<ZoomRef | null>(null);

const FALLBACK: ZoomRef = { current: 1 };

export function useZoomRef(): ZoomRef {
  const ref = useContext(ZoomContext);
  return ref ?? FALLBACK;
}
