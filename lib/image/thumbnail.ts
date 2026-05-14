"use client";

/**
 * Centre-crop the source to a square of `size` × `size` WebP.
 * Used for canvas/gallery thumbnails to keep DOM cheap. See tech-spec §14.3.
 */
export async function makeSquareThumbnail(
  source: Blob,
  size: number,
  quality: number,
): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const minEdge = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - minEdge) / 2;
    const sy = (bitmap.height - minEdge) / 2;
    return await cropToWebp(bitmap, sx, sy, minEdge, minEdge, size, quality);
  } finally {
    bitmap.close?.();
  }
}

async function cropToWebp(
  bitmap: ImageBitmap,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  size: number,
  quality: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, size, size);
    return await canvas.convertToBlob({ type: "image/webp", quality });
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, size, size);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/webp",
      quality,
    );
  });
}
