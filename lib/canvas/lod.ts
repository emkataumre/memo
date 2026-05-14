export type LodTier = 0 | 1 | 2;
// 0 = full card (text, controls, variant decorations, resize handle)
// 1 = simplified (truncated text, no controls) — currently bypassed;
//     kept on the type for future re-introduction
// 2 = silhouette (just the colored footprint, no text)
//
// Cards keep their full detail almost until the minimum zoom. The
// silhouette only kicks in when the user has zoomed all the way out
// (≈ the same point at which the minimap becomes useful).

export function lodFromZoom(zoom: number): LodTier {
  if (zoom >= 0.15) return 0;
  return 2;
}
