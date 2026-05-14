export type LodTier = 0 | 1 | 2;
// 0 = full card (text, controls, variant decorations, resize handle)
<<<<<<< HEAD
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
=======
// 1 = simplified (truncated text, no controls) — currently bypassed;
//     kept on the type for future re-introduction
// 2 = silhouette (just the colored footprint, no text)
//
// Cards keep their full detail almost until the minimum zoom. The
// silhouette only kicks in when the user has zoomed all the way out
// (≈ the same point at which the minimap becomes useful).

export function lodFromZoom(zoom: number): LodTier {
  if (zoom >= 0.15) return 0;
>>>>>>> 0b4368ea330c2a1fab2ade1f222e432294e3fb48
  return 2;
}
