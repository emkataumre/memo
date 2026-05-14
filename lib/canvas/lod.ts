export type LodTier = 0 | 1 | 2;
// 0 = full card (text, controls, variant decorations, resize handle)
// 1 = simplified (truncated text, no controls)
// 2 = silhouette (just the colored footprint, no text)
//
// Thresholds lean toward keeping the full-fidelity tier longer because
// the variant decorations (strip, tape, quote, grain) are most of the
// visual character of a note. Tier 2 aligns with the minimap's
// activation point so the chrome stays coherent.

export function lodFromZoom(zoom: number): LodTier {
  if (zoom >= 0.25) return 0;
  if (zoom >= 0.12) return 1;
  return 2;
}
