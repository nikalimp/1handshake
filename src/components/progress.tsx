"use client";
import { useEffect, useState } from "react";

/**
 * A progress bar for AI steps we can't measure exactly. Within a stage it moves from `from` to `to`
 * along an easing curve sized to the expected time (`estMs`), slowing down near the end and never
 * claiming to be done; `real` (0–1) overrides the curve when there is a true measure (e.g. upload).
 */
export function Progress({ label, from, to, estMs, startedAt, real }: { label: string; from: number; to: number; estMs: number; startedAt: number; real?: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 120);
    return () => clearInterval(t);
  }, []);
  const share = real ?? 1 - Math.exp(-Math.max(0, now - startedAt) / (estMs / 2.2));
  const value = Math.min(99, Math.round(from + (to - from) * Math.min(0.97, share)));
  return (
    <div className="flex w-full flex-col gap-1.5" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-semibold">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-fire" aria-hidden />
          {label}
        </span>
        <span className="font-mono text-xs text-ink-muted tabular-nums">{value}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunk">
        <div className="relative h-full rounded-full bg-fire transition-[width] duration-200 ease-out" style={{ width: `${value}%` }}>
          <span className="absolute inset-0 animate-[shimmer_1.4s_linear_infinite] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent)] bg-[length:200%_100%]" aria-hidden />
        </div>
      </div>
    </div>
  );
}
