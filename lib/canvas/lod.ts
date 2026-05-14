export type LodTier = 0 | 1 | 2;
// 0 = full card (text, controls)
// 1 = simplified (truncated text, no controls)
// 2 = dot only (6×6 colored block)

export function lodFromZoom(zoom: number): LodTier {
  if (zoom >= 0.7) return 0;
  if (zoom >= 0.2) return 1;
  return 2;
}
