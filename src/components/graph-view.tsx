"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { buttonClass } from "@/components/button";
import { initials } from "@/lib/utils";

export type GraphNode = {
  id: string;
  name: string;
  role: string;
  handle: string | null;
  city: string | null;
  spheres: number[];
  avatar: string | null;
  degree: 0 | 1 | 2;
};
type Edge = { src: string; dst: string; kind: "met" | "intro" };
type Sphere = { id: number; parent_id: number | null; name: string };

const RADIUS = { 0: 26, 1: 19, 2: 12 } as const;
const RING1 = 0.63; // inner ring, as a share of the outer one

type Spot = { a: number; r: number }; // angle and ring radius (0 = centre, 1 = outer ring)

/** Radial layout: me in the centre, connections on the inner ring, their people next to them outside. */
function layout(meId: string, nodes: GraphNode[], edges: Edge[]) {
  const spot = new Map<string, Spot>();
  spot.set(meId, { a: 0, r: 0 });
  const first = nodes.filter((n) => n.degree === 1).sort((a, b) => a.name.localeCompare(b.name));
  const slot = (Math.PI * 2) / Math.max(first.length, 1);
  first.forEach((n, i) => spot.set(n.id, { a: -Math.PI / 2 + i * slot, r: RING1 }));
  // Each second-degree person sits next to the first connection that leads to them.
  const parent = new Map<string, string>();
  for (const e of edges) {
    const n = nodes.find((x) => x.id === e.dst);
    if (n?.degree === 2 && spot.has(e.src) && e.src !== meId && !parent.has(e.dst)) parent.set(e.dst, e.src);
  }
  const children = new Map<string, string[]>();
  for (const [child, p] of parent) children.set(p, [...(children.get(p) ?? []), child]);
  for (const [p, kids] of children) {
    const base = spot.get(p)!.a;
    const spread = Math.min(slot * 0.8, (Math.PI / 9) * kids.length);
    kids.forEach((k, i) => {
      const a = kids.length === 1 ? base : base - spread / 2 + (spread * i) / (kids.length - 1);
      spot.set(k, { a, r: 1 - (i % 2) * 0.1 }); // stagger so crowded groups don't overlap
    });
  }
  return { spot, parent };
}

/** Watches an element's size, so the graph can stretch to whatever space it gets. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export function GraphView({ meId, nodes, edges, spheres }: { meId: string; nodes: GraphNode[]; edges: Edge[]; spheres: Sphere[] }) {
  const [city, setCity] = useState("");
  const [sphere, setSphere] = useState<number | "">("");
  const [picked, setPicked] = useState<string | null>(null);
  const [box, { w, h }] = useSize<HTMLDivElement>();

  // The graph owns the whole screen: no page scroll behind it.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const { spot, parent } = useMemo(() => layout(meId, nodes, edges), [meId, nodes, edges]);
  const people = useMemo(() => nodes.filter((n) => n.degree > 0), [nodes]);
  const cities = useMemo(() => [...new Set(people.filter((n) => n.city).map((n) => n.city!))].sort(), [people]);
  // Only spheres someone in my graph works in, grouped under their parent.
  const sphereGroups = useMemo(() => {
    const present = new Set(people.flatMap((n) => n.spheres));
    const byIdS = new Map(spheres.map((s) => [s.id, s]));
    const parents = new Set([...present].map((id) => byIdS.get(id)).filter(Boolean).map((s) => s!.parent_id ?? s!.id));
    return spheres
      .filter((p) => p.parent_id === null && parents.has(p.id))
      .map((p) => ({ parent: p, children: spheres.filter((s) => s.parent_id === p.id && present.has(s.id)) }));
  }, [people, spheres]);
  const sphereFamily = useMemo(() => {
    if (sphere === "") return null;
    return new Set([sphere, ...spheres.filter((s) => s.parent_id === sphere).map((s) => s.id)]);
  }, [sphere, spheres]);

  // Rings stay round and grow with the space we have.
  const s = Math.min(1.5, Math.max(0.85, Math.min(w, h) / 400));
  const margin = 34 * s;
  const rx = Math.max(0, Math.min(w, h) / 2 - margin);
  const ry = rx;
  const cx = w / 2;
  const cy = h / 2;
  const pos = (id: string) => {
    const p = spot.get(id);
    return p ? { x: cx + rx * p.r * Math.cos(p.a), y: cy + ry * p.r * Math.sin(p.a) } : null;
  };

  const filtering = city !== "" || sphere !== "";
  const matches = (n: GraphNode) => n.degree > 0 && (!city || n.city === city) && (!sphereFamily || n.spheres.some((x) => sphereFamily.has(x)));
  const hit = new Set(filtering ? nodes.filter(matches).map((n) => n.id) : []);
  // The path to a match lights up: me → (connection →) match.
  const lit = new Set<string>();
  for (const id of hit) {
    const p = parent.get(id);
    lit.add(`${meId}>${p ?? id}`);
    if (p) lit.add(`${p}>${id}`);
  }

  const drawn = edges.filter((e) => spot.has(e.src) && spot.has(e.dst) && !(byId.get(e.dst)?.degree === 1 && byId.get(e.src)?.degree === 1 && e.src > e.dst));
  const firstCount = nodes.filter((n) => n.degree === 1).length;
  const secondCount = nodes.filter((n) => n.degree === 2).length;
  const sel = picked ? byId.get(picked) : null;
  const select = "h-11 min-w-0 rounded-full border border-line bg-surface px-4 text-sm font-semibold outline-none";

  return (
    <div className="fixed inset-x-0 top-0 bottom-[calc(92px+env(safe-area-inset-bottom,0px))] flex flex-col pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 pt-6">
        <header className="flex items-center justify-between px-0.5">
          <h1 className="text-[32px] leading-9 font-extrabold tracking-[-0.03em]">graph</h1>
          <Link href="/invite" className={buttonClass("primary", "sm")}>
            + invite
          </Link>
        </header>
        <div className="grid grid-cols-2 gap-2">
          <select aria-label="city" value={city} onChange={(e) => setCity(e.target.value)} className={select}>
            <option value="">all cities</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select aria-label="sphere" value={sphere} onChange={(e) => setSphere(e.target.value ? Number(e.target.value) : "")} className={select}>
            <option value="">all spheres</option>
            {sphereGroups.map(({ parent: p, children }) => (
              <optgroup key={p.id} label={p.name}>
                <option value={p.id}>all {p.name}</option>
                {children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <p className="meta px-0.5">
          {firstCount} connections · {secondCount} one handshake away
          {filtering && ` · ${hit.size} match`}
        </p>
      </div>

      <div ref={box} className="relative min-h-0 flex-1">
        {w > 0 && (
          <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="absolute inset-0 block" role="img" aria-label="your network">
            <circle cx={cx} cy={cy} r={rx * RING1} fill="none" stroke="var(--line)" strokeDasharray="2 6" />
            <circle cx={cx} cy={cy} r={rx} fill="none" stroke="var(--line)" strokeDasharray="2 6" />
            {drawn.map((e) => {
              const a = pos(e.src)!;
              const b = pos(e.dst)!;
              const on = lit.has(`${e.src}>${e.dst}`);
              const chord = byId.get(e.src)?.degree === 1 && byId.get(e.dst)?.degree === 1;
              const d = chord ? `M${a.x} ${a.y} Q${cx} ${cy} ${b.x} ${b.y}` : `M${a.x} ${a.y} L${b.x} ${b.y}`;
              return (
                <path
                  key={`${e.src}-${e.dst}`}
                  d={d}
                  fill="none"
                  stroke={on ? "var(--fire)" : "var(--line-strong)"}
                  strokeWidth={on ? 2.5 : 1.2}
                  strokeDasharray={e.kind === "intro" ? "4 4" : undefined}
                  opacity={filtering && !on ? 0.25 : chord ? 0.5 : 1}
                />
              );
            })}
            {nodes.map((n) => {
              const p = pos(n.id);
              if (!p) return null;
              const r = RADIUS[n.degree] * s;
              const dim = filtering && n.degree > 0 && !hit.has(n.id);
              const ring = (filtering && hit.has(n.id)) || picked === n.id;
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x} ${p.y})`}
                  opacity={dim ? 0.3 : 1}
                  className="cursor-pointer outline-none focus-visible:[&>circle:first-of-type]:stroke-[var(--focus)] focus-visible:[&>circle:first-of-type]:stroke-2"
                  role="button"
                  tabIndex={0}
                  aria-label={n.name}
                  onClick={() => setPicked(n.id === picked ? null : n.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setPicked(n.id)}
                >
                  <clipPath id={`clip-${n.id}`}>
                    <circle r={r} />
                  </clipPath>
                  <circle r={r + (ring ? 3.5 : 1.5)} fill={ring ? "var(--fire)" : "var(--surface)"} />
                  <circle r={r} fill={n.degree === 0 ? "var(--ink)" : "var(--surface-sunk)"} />
                  {n.avatar ? (
                    <image href={n.avatar} x={-r} y={-r} width={r * 2} height={r * 2} clipPath={`url(#clip-${n.id})`} preserveAspectRatio="xMidYMid slice" />
                  ) : (
                    <text textAnchor="middle" dominantBaseline="central" fontSize={r * 0.75} fontWeight={700} fill={n.degree === 0 ? "var(--paper)" : "var(--ink)"}>
                      {initials(n.name)}
                    </text>
                  )}
                  {n.degree === 1 && (
                    <text y={r + 13} textAnchor="middle" fontSize={11 * Math.min(s, 1.2)} fill="var(--ink-muted)" stroke="var(--paper)" strokeWidth={4} paintOrder="stroke" strokeLinejoin="round">
                      {n.name.split(" ")[0]}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {firstCount === 0 && (
          <p className="absolute inset-x-0 top-[calc(50%+48px)] px-6 text-center text-ink-muted">your graph grows with every handshake.</p>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-2 mx-auto flex max-w-md flex-col gap-2 px-4">
          {sel ? (
            <div className="pointer-events-auto flex items-center gap-3 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
              <Avatar name={sel.name} size={48} src={sel.avatar} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{sel.degree === 0 ? "you" : sel.name}</p>
                <p className="truncate text-sm text-ink-muted">{sel.role}</p>
                <p className="meta">
                  {[sel.city, sel.degree === 1 ? "connection" : sel.degree === 2 ? `via ${byId.get(parent.get(sel.id) ?? "")?.name.split(" ")[0] ?? "a connection"}` : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              {(sel.degree === 0 || sel.handle) && (
                <Link href={sel.degree === 0 ? "/profile" : `/people/${sel.handle}`} className={buttonClass("secondary", "sm")}>
                  profile
                </Link>
              )}
            </div>
          ) : filtering && hit.size > 0 ? (
            <ul className="pointer-events-auto -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              {[...hit].map((id) => {
                const n = byId.get(id)!;
                return (
                  <li key={id} className="shrink-0">
                    <Link href={n.handle ? `/people/${n.handle}` : "#"} className="flex max-w-60 items-center gap-2.5 rounded-full bg-surface py-1.5 pr-4 pl-1.5 shadow-[var(--shadow-card)]">
                      <Avatar name={n.name} size={32} src={n.avatar} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{n.name}</span>
                        <span className="meta block">{n.degree === 1 ? "1st" : "2nd"}{n.city ? ` · ${n.city}` : ""}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
