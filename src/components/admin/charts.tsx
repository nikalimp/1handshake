"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { compact, weekLabel } from "@/lib/admin-stats";

// Lightweight SVG charts for the admin overview. No chart library: weekly columns (single or stacked)
// with a hover tooltip, and a legend whenever there are two or more series.
// Series colours are CSS variables set in the admin layout (validated for both themes).

export type Series = { key: string; label: string; color: string; values: number[] };


function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Rounded top (4px), square at the baseline. */
function bar(x: number, y: number, w: number, h: number, round: boolean) {
  if (h <= 0) return "";
  const r = round ? Math.min(4, w / 2, h) : 0;
  return `M${x},${y + h}V${y + r}${r ? `Q${x},${y} ${x + r},${y}` : ""}H${x + w - r}${r ? `Q${x + w},${y} ${x + w},${y + r}` : ""}V${y + h}Z`;
}

export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
      {series.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
          {s.label}
          <span className="font-mono text-xs text-ink">{compact(s.values.reduce((a, b) => a + b, 0))}</span>
        </li>
      ))}
    </ul>
  );
}

/** Weekly columns. Several series stack; the tooltip lists each series for the hovered week. */
export function WeeklyBars({ weeks, series, height = 150, format = compact, label }: { weeks: string[]; series: Series[]; height?: number; format?: (n: number) => string; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const left = 30;
  const bottom = 20;
  const top = 6;
  const plotW = Math.max(0, width - left);
  const plotH = height - bottom - top;
  const totals = weeks.map((_, i) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0));
  const max = niceMax(Math.max(0, ...totals));
  const band = weeks.length ? plotW / weeks.length : 0;
  const barW = Math.max(2, Math.min(24, band - 2));
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const every = Math.max(1, Math.ceil(weeks.length / Math.max(1, Math.floor(plotW / 56))));

  return (
    <div className="flex flex-col gap-2">
      <Legend series={series} />
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={label} className="block overflow-visible">
            {[0, max / 2, max].map((t) => (
              <g key={t}>
                <line x1={left} x2={width} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
                <text x={left - 6} y={y(t) + 4} textAnchor="end" className="fill-ink-muted font-mono text-[10px]">
                  {compact(t)}
                </text>
              </g>
            ))}
            {weeks.map((w, i) => {
              const x = left + i * band + (band - barW) / 2;
              let acc = 0;
              const topIdx = series.map((s) => s.values[i] ?? 0).findLastIndex((v) => v > 0);
              return (
                <g key={w} opacity={hover === null || hover === i ? 1 : 0.45}>
                  {series.map((s, si) => {
                    const v = s.values[i] ?? 0;
                    if (v <= 0) return null;
                    const y0 = y(acc + v);
                    const h = y(acc) - y0 - (acc > 0 ? 2 : 0); // 2px surface gap between segments
                    acc += v;
                    return <path key={s.key} d={bar(x, y0, barW, Math.max(h, 1), si === topIdx)} fill={s.color} />;
                  })}
                  {i % every === 0 && (
                    <text x={left + i * band + band / 2} y={height - 4} textAnchor="middle" className="fill-ink-muted font-mono text-[10px]">
                      {weekLabel(w)}
                    </text>
                  )}
                  <rect
                    x={left + i * band}
                    y={0}
                    width={band}
                    height={height - bottom}
                    fill="transparent"
                    onPointerEnter={() => setHover(i)}
                    onPointerLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    tabIndex={-1}
                  />
                </g>
              );
            })}
          </svg>
        )}
        {hover !== null && (
          <div
            className="pointer-events-none absolute z-10 min-w-36 rounded-[var(--radius-sm)] bg-surface px-3 py-2 text-sm shadow-[var(--shadow-card)]"
            style={{ left: Math.min(Math.max(0, left + hover * band + band / 2 - 72), Math.max(0, width - 150)), top: 0 }}
          >
            <p className="meta mb-1">week of {weekLabel(weeks[hover])}</p>
            {series.map((s) => (
              <p key={s.key} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />
                  {s.label}
                </span>
                <span className="font-mono tabular-nums">{format(s.values[hover] ?? 0)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
