// Browser-only helpers for photos. Every photo is re-drawn on a canvas and re-encoded as JPEG:
// that crops it to a square and drops EXIF metadata (location, device) before upload.

type Source = HTMLVideoElement | ImageBitmap;

function sourceSize(src: Source) {
  return src instanceof HTMLVideoElement ? { w: src.videoWidth, h: src.videoHeight } : { w: src.width, h: src.height };
}

/** Centre-crops the source to a square JPEG. `mirror` matches a front-camera preview. */
export async function squareJpeg(src: Source, { size = 1080, mirror = false, quality = 0.86 } = {}): Promise<Blob> {
  const { w, h } = sourceSize(src);
  const side = Math.min(w, h);
  const out = Math.min(size, side);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas is not available");
  if (mirror) {
    ctx.translate(out, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, (w - side) / 2, (h - side) / 2, side, side, 0, 0, out, out);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not encode the photo"))), "image/jpeg", quality));
}

/** A picked file → square JPEG (respects the phone's rotation flag). */
export async function fileToSquareJpeg(file: File, size = 1080) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    return await squareJpeg(bitmap, { size });
  } finally {
    bitmap.close();
  }
}
