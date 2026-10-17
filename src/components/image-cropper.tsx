"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";

/**
 * Square crop with zoom: drag to move, pinch / wheel / slider to zoom. The result is re-drawn on a canvas
 * as JPEG, which also drops EXIF (location, device). `round` shows a circle mask, as on avatars.
 */
export function ImageCropper({ file, size = 640, round = true, onCancel, onDone }: { file: File; size?: number; round?: boolean; onCancel: () => void; onDone: (blob: Blob) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<{ bitmap: ImageBitmap; url: string } | null>(null);
  const [v, setV] = useState(320); // viewport side, px
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // image top-left inside the viewport
  const [error, setError] = useState<string | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  // Decode once (respecting the phone's rotation flag) and show it from a canvas copy.
  useEffect(() => {
    let alive = true;
    let url = "";
    createImageBitmap(file, { imageOrientation: "from-image" })
      .then(async (bitmap) => {
        const c = document.createElement("canvas");
        c.width = bitmap.width;
        c.height = bitmap.height;
        c.getContext("2d")?.drawImage(bitmap, 0, 0);
        const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.92));
        if (!alive || !blob) return;
        url = URL.createObjectURL(blob);
        setImg({ bitmap, url });
      })
      .catch(() => alive && setError("couldn't open this picture. try another one."));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setV(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const w = img?.bitmap.width ?? 1;
  const h = img?.bitmap.height ?? 1;
  const base = v / Math.min(w, h); // cover the square at zoom 1
  const s = base * zoom;
  const clamp = (p: { x: number; y: number }, sc = s) => ({
    x: Math.min(0, Math.max(v - w * sc, p.x)),
    y: Math.min(0, Math.max(v - h * sc, p.y)),
  });
  // centre the picture when it (or the viewport) first appears
  const [placed, setPlaced] = useState("");
  const key = `${img?.url}|${v}`;
  if (img && placed !== key) {
    setPlaced(key);
    setPos({ x: (v - w * s) / 2, y: (v - h * s) / 2 });
  }

  const zoomTo = (z: number) => {
    const nz = Math.min(4, Math.max(1, z));
    const ns = base * nz;
    // keep the centre of the square where it is
    const cx = (v / 2 - pos.x) / s;
    const cy = (v / 2 - pos.y) / s;
    setZoom(nz);
    setPos(clamp({ x: v / 2 - cx * ns, y: v / 2 - cy * ns }, ns));
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      zoomTo(pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist));
      return;
    }
    setPos((p) => clamp({ x: p.x + e.clientX - prev.x, y: p.y + e.clientY - prev.y }));
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const done = async () => {
    if (!img) return;
    const out = Math.min(size, Math.round(v / s));
    const c = document.createElement("canvas");
    c.width = out;
    c.height = out;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img.bitmap, -pos.x / s, -pos.y / s, v / s, v / s, 0, 0, out, out);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.86));
    if (blob) onDone(blob);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-paper/95 px-5 backdrop-blur" role="dialog" aria-modal="true" aria-label="crop your photo">
      <p className="font-semibold">move and zoom</p>
      <div
        ref={box}
        className="relative aspect-square w-full max-w-[360px] touch-none overflow-hidden rounded-[var(--radius-lg)] bg-surface-sunk select-none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={(e) => zoomTo(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
      >
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img.url} alt="" draggable={false} className="pointer-events-none absolute top-0 left-0 max-w-none origin-top-left" style={{ width: w * s, height: h * s, transform: `translate(${pos.x}px, ${pos.y}px)` }} />
        )}
        {round && <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgb(0_0_0/0.45)]" />}
        {!img && !error && <p className="meta absolute inset-0 grid place-items-center">opening…</p>}
      </div>
      {error && <p className="text-sm text-fire-ink">{error}</p>}
      <label className="flex w-full max-w-[360px] items-center gap-3">
        <span className="meta">−</span>
        <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => zoomTo(Number(e.target.value))} className="w-full accent-[var(--fire)]" aria-label="zoom" />
        <span className="meta">+</span>
      </label>
      <div className="flex w-full max-w-[360px] gap-3">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>
          cancel
        </Button>
        <Button className="flex-1" disabled={!img} onClick={done}>
          use photo
        </Button>
      </div>
    </div>
  );
}
