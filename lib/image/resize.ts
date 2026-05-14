"use client";

/**
 * Resize a Blob image so its longest edge is at most `maxLongEdge`.
 * Returns JPEG at the given quality. No-op (returns blob ≤ target) is fine.
 */
export async function resizeToJpeg(
  source: Blob,
  maxLongEdge: number,
  quality: number,
): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const ratio = Math.min(1, maxLongEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * ratio));
    const h = Math.max(1, Math.round(bitmap.height * ratio));
    return await drawToJpeg(bitmap, w, h, quality);
  } finally {
    bitmap.close?.();
  }
}

async function drawToJpeg(
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
    return await canvas.convertToBlob({ type: "image/jpeg", quality });
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
      "image/jpeg",
      quality,
    );
  });
}
