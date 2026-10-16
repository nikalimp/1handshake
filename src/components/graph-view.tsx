"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
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

const SIZE = 400;
const C = SIZE / 2;
const R1 = 112;
const R2 = 178;
const RADIUS = { 0: 26, 1: 19, 2: 12 } as const;

/** Radial layout: me in the centre, connections on the inner ring, their people next to them outside. */
function layout(meId: string, nodes: GraphNode[], edges: Edge[]) {
  const pos = new Map<string, { x: number; y: number; a: number }>();
  pos.set(meId, { x: C, y: C, a: 0 });
  const first = nodes.filter((n) => n.degree === 1).sort((a, b) => a.name.localeCompare(b.name));
  const slot = (Math.PI * 2) / Math.max(first.length, 1);
  first.forEach((n, i) => {
    const a = -Math.PI / 2 + i * slot;
    pos.set(n.id, { x: C + R1 * Math.cos(a), y: C + R1 * Math.sin(a), a });
  });
  // Each second-degree person sits next to the first connection that leads to them.
  const parent = new Map<string, string>();
  for (const e of edges) {
    const n = nodes.find((x) => x.id === e.dst);
    if (n?.degree === 2 && pos.has(e.src) && e.src !== meId && !parent.has(e.dst)) parent.set(e.dst, e.src);
  }
  const children = new Map<string, string[]>();
  for (const [child, p] of parent) children.set(p, [...(children.get(p) ?? []), child]);
  for (const [p, kids] of children) {
    const base = pos.get(p)!.a;
    const spread = Math.min(slot * 0.8, (Math.PI / 9) * kids.length);
    kids.forEach((k, i) => {
      const a = kids.length === 1 ? base : base - spread / 2 + (spread * i) / (kids.length - 1);
      const r = R2 - (i % 2) * 18; // stagger so crowded groups don't overlap
      pos.set(k, { x: C + r * Math.cos(a), y: C + r * Math.sin(a), a });
    });
  }
  return { pos, parent };
}

export function GraphView({ meId, nodes, edges, spheres }: { meId: string; nodes: GraphNode[]; edges: Edge[]; spheres: Sphere[] }) {
  const [city, setCity] = useState("");
  const [sphere, setSphere] = useState<number | "">("");
  const [picked, setPicked] = useState<string | null>(null);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const { pos, parent } = useMemo(() => layout(meId, nodes, edges), [meId, nodes, edges]);
  const cities = useMemo(() => [...new Set(nodes.filter((n) => n.degree > 0 && n.city).map((n) => n.city!))].sort(), [nodes]);
  const sphereFamily = useMemo(() => {
    if (sphere === "") return null;
    return new Set([sphere, ...spheres.filter((s) => s.parent_id === sphere).map((s) => s.id)]);
  }, [sphere, spheres]);

  const filtering = city !== "" || sphere !== "";
  const matches = (n: GraphNode) => n.degree > 0 && (!city || n.city === city) && (!sphereFamily || n.spheres.some((s) => sphereFamily.has(s)));
  const hit = new Set(filtering ? nodes.filter(matches).map((n) => n.id) : []);
  // The path to a match lights up: me → (connection →) match.
  const lit = new Set<string>();
  for (const id of hit) {
    const p = parent.get(id);
    lit.add(`${meId}>${p ?? id}`);
    if (p) lit.add(`${p}>${id}`);
  }

  const drawn = edges.filter((e) => pos.has(e.src) && pos.has(e.dst) && !(byId.get(e.dst)?.degree === 1 && byId.get(e.src)?.degree === 1 && e.src > e.dst));
  const firstCount = nodes.filter((n) => n.degree === 1).length;
  const secondCount = nodes.filter((n) => n.degree === 2).length;
  const sel = picked ? byId.get(picked) : null;
  const parents = spheres.filter((s) => s.parent_id === null);

  return (
    <div className="flex flex-col gap-4 pt-6">
      <header className="flex items-center justify-between px-0.5">
        <h1 className="text-[32px] leading-9 font-extrabold tracking-[-0.03em]">graph</h1>
        <Link href="/invite" className={buttonClass("primary", "sm")}>
          + invite
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <select aria-label="city" value={city} onChange={(e) => setCity(e.target.value)} className="h-11 rounded-full border border-line bg-surface px-4 text-sm font-semibold outline-none">
          <option value="">all cities</option>
          {cities.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select aria-label="sphere" value={sphere} onChange={(e) => setSphere(e.target.value ? Number(e.target.value) : "")} className="h-11 rounded-full border border-line bg-surface px-4 text-sm font-semibold outline-none">
          <option value="">all spheres</option>
          {parents.map((p) => (
            <optgroup key={p.id} label={p.name}>
              <option value={p.id}>all {p.name}</option>
              {spheres
                .filter((s) => s.parent_id === p.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
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

      <div className="rounded-[var(--radius-lg)] bg-surface p-2 shadow-[var(--shadow-card)]">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="block h-auto w-full" role="img" aria-label="your network">
          <circle cx={C} cy={C} r={R1} fill="none" stroke="var(--line)" strokeDasharray="2 6" />
          <circle cx={C} cy={C} r={R2} fill="none" stroke="var(--line)" strokeDasharray="2 6" />
          {drawn.map((e) => {
            const a = pos.get(e.src)!;
            const b = pos.get(e.dst)!;
            const on = lit.has(`${e.src}>${e.dst}`);
            const chord = byId.get(e.src)?.degree === 1 && byId.get(e.dst)?.degree === 1;
            const d = chord ? `M${a.x} ${a.y} Q${C} ${C} ${b.x} ${b.y}` : `M${a.x} ${a.y} L${b.x} ${b.y}`;
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
            const p = pos.get(n.id);
            if (!p) return null;
            const r = RADIUS[n.degree];
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
                  <text y={r + 13} textAnchor="middle" fontSize={11} fill="var(--ink-muted)">
                    {n.name.split(" ")[0]}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {sel ? (
        <div className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
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
      ) : (
        <p className="meta px-0.5 text-center">tap a person to see who they are · dashed lines are intros, solid ones met in person</p>
      )}

      {firstCount === 0 && (
        <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
          <p className="text-ink-muted">your graph grows with every handshake.</p>
        </div>
      )}

      {filtering && hit.size > 0 && (
        <ul className="flex flex-col gap-2">
          {[...hit].map((id) => {
            const n = byId.get(id)!;
            return (
              <li key={id}>
                <Link href={n.handle ? `/people/${n.handle}` : "#"} className="flex items-center gap-3 rounded-[var(--radius-md)] bg-surface px-3 py-2.5 shadow-[var(--shadow-card)]">
                  <Avatar name={n.name} size={36} src={n.avatar} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{n.name}</span>
                    <span className="block truncate text-sm text-ink-muted">{n.role}</span>
                  </span>
                  <span className="meta">{n.degree === 1 ? "1st" : "2nd"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
