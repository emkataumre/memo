export type LodTier = 0 | 1 | 2;
// 0 = full card (text, controls, variant decorations, resize handle)
// 1 = simplified (truncated text, plain solid bg, no decorations, no controls)
// 2 = silhouette (just the colored footprint, no text)
//
// Three-tier ladder so mid-zoom (lots of cards visible but each still
// individually legible) doesn't drag the frame rate with grain
// gradients, tape decorations, typography ladders, and resize handles.
// Silhouette stays at the deep zoom-out — same threshold as before.

export function lodFromZoom(zoom: number): LodTier {
  if (zoom >= 0.4) return 0;
  if (zoom >= 0.15) return 1;
  return 2;
}
