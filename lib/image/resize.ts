"use client";

/**
 * Resize once, then re-encode at progressively lower quality until the result
 * fits `targetBytes`. Returns the first blob that fits, or the smallest one
 * tried if none fit. Decoding the source bitmap is the expensive step, so we
 * reuse it across encode passes.
 *
 * Output is WebP — ~25-35% smaller than JPEG at equivalent quality. Encode
 * runs through the same `canvas.convertToBlob` / `toBlob` paths, so no
 * additional dep or noticeable slowdown vs JPEG.
 */
export async function resizeToWebpBudget(
  source: Blob,
  maxLongEdge: number,
  qualities: number[],
  targetBytes: number,
): Promise<Blob> {
  if (qualities.length === 0) throw new Error("qualities must not be empty");
  const bitmap = await createImageBitmap(source);
  try {
    const ratio = Math.min(1, maxLongEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * ratio));
    const h = Math.max(1, Math.round(bitmap.height * ratio));
    let smallest: Blob | null = null;
    for (const q of qualities) {
      const blob = await drawToWebp(bitmap, w, h, q);
      if (blob.size <= targetBytes) return blob;
      if (!smallest || blob.size < smallest.size) smallest = blob;
    }
    return smallest!;
  } finally {
    bitmap.close?.();
  }
}

async function drawToWebp(
  bitmap: ImageBitmap,
  w: number,
  h: number,
  quality: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(bitmap, 0, 0, w, h);
    return await canvas.convertToBlob({ type: "image/webp", quality });
  }
  // Fallback for older Safari
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/webp",
      quality,
    );
  });
}
