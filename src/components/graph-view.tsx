"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { buttonClass } from "@/components/button";
import { initials } from "@/lib/utils";

export type GraphNode = {
  id: string;
  kind: "person" | "event";
  name: string;
  /** a person's role, an event's date */
  role: string;
  href: string | null;
  city: string | null;
  spheres: number[];
  /** a person's photo, an event's cover */
  avatar: string | null;
  degree: 0 | 1 | 2;
  /** events: how many people of my graph checked in */
  count?: number;
};
export type GraphEdge = { src: string; dst: string; kind: "met" | "intro" | "event" };
type Edge = GraphEdge;
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
  // An event that only people further out went to sits next to one of them.
  for (const e of edges) {
    if (spot.has(e.dst) || !spot.has(e.src) || e.kind !== "event") continue;
    const n = spot.get(e.src)!;
    spot.set(e.dst, { a: n.a + 0.12, r: 1 });
    parent.set(e.dst, parent.get(e.src) ?? e.src);
  }
  return { spot, parent };
}

/** The order cards are swiped in: closest first, then around the circle clockwise from the top. */
function deckOrder(nodes: GraphNode[], spot: Map<string, Spot>) {
  const turn = (a: number) => (((a + Math.PI / 2) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return nodes
    .filter((n) => n.degree > 0 && spot.has(n.id))
    .sort((x, y) => x.degree - y.degree || turn(spot.get(x.id)!.a) - turn(spot.get(y.id)!.a));
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
  const deck = useRef<HTMLUListElement>(null);

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
  const people = useMemo(() => nodes.filter((n) => n.degree > 0 && n.kind === "person"), [nodes]);
  const cities = useMemo(() => [...new Set(nodes.filter((n) => n.degree > 0 && n.city).map((n) => n.city!))].sort(), [nodes]);
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

  // The cards: everyone (and every event) in the order of the graph, or only matches while filtering.
  const cards = useMemo(() => deckOrder(filtering ? nodes.filter((n) => hit.has(n.id)) : nodes, spot), [nodes, spot, filtering, hit.size, city, sphere]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = picked && cards.some((c) => c.id === picked) ? picked : (cards[0]?.id ?? null);

  // The path to a match or to the card in view lights up: me → (connection →) them.
  const lit = new Set<string>();
  for (const id of [...hit, ...(current ? [current] : [])]) {
    const p = parent.get(id);
    lit.add(`${meId}>${p ?? id}`);
    if (p) lit.add(`${p}>${id}`);
  }

  // Swiping the deck picks the card in view; tapping a node scrolls the deck to its card.
  const onDeckScroll = () => {
    const el = deck.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    const step = first.offsetWidth + 8;
    const i = Math.max(0, Math.min(cards.length - 1, Math.round(el.scrollLeft / step)));
    if (cards[i] && cards[i].id !== current) setPicked(cards[i].id);
  };
  const show = (id: string) => {
    setPicked(id);
    const i = cards.findIndex((c) => c.id === id);
    const el = deck.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (el && first && i >= 0) el.scrollTo({ left: i * (first.offsetWidth + 8), behavior: "smooth" });
  };
  useEffect(() => {
    deck.current?.scrollTo({ left: 0 });
  }, [city, sphere]);

  const drawn = edges.filter((e) => spot.has(e.src) && spot.has(e.dst) && !(byId.get(e.dst)?.degree === 1 && byId.get(e.src)?.degree === 1 && e.src > e.dst && e.kind !== "event"));
  const firstCount = people.filter((n) => n.degree === 1).length;
  const secondCount = people.filter((n) => n.degree === 2).length;
  const eventCount = nodes.filter((n) => n.kind === "event").length;
  const select = "h-11 min-w-0 rounded-full border border-line bg-surface px-4 text-sm font-semibold outline-none";

  const via = (n: GraphNode) => {
    if (n.kind === "event") return n.count ? `${n.count} of yours checked in` : "event";
    if (n.degree === 1) return "connection";
    return `via ${byId.get(parent.get(n.id) ?? "")?.name.split(" ")[0] ?? "a connection"}`;
  };

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
          {eventCount > 0 && ` · ${eventCount} ${eventCount === 1 ? "event" : "events"}`}
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
              const on = lit.has(`${e.src}>${e.dst}`) || (current !== null && byId.get(current)?.kind === "event" && e.dst === current);
              const chord = byId.get(e.src)?.degree === 1 && byId.get(e.dst)?.degree === 1;
              const d = chord ? `M${a.x} ${a.y} Q${cx} ${cy} ${b.x} ${b.y}` : `M${a.x} ${a.y} L${b.x} ${b.y}`;
              return (
                <path
                  key={`${e.src}-${e.dst}`}
                  d={d}
                  fill="none"
                  stroke={on ? "var(--fire)" : "var(--line-strong)"}
                  strokeWidth={on ? 2.5 : 1.2}
                  strokeDasharray={e.kind === "intro" ? "4 4" : e.kind === "event" ? "1 4" : undefined}
                  strokeLinecap="round"
                  opacity={(filtering || current) && !on ? 0.3 : chord ? 0.5 : 1}
                />
              );
            })}
            {nodes.map((n) => {
              const p = pos(n.id);
              if (!p) return null;
              const r = RADIUS[n.degree] * s;
              const dim = filtering && n.degree > 0 && !hit.has(n.id);
              const ring = n.id === current || (filtering && hit.has(n.id));
              const strong = n.id === current;
              const ev = n.kind === "event";
              // events are rounded squares, people are circles
              const shape = (rr: number, fill: string) => (ev ? <rect x={-rr} y={-rr} width={rr * 2} height={rr * 2} rx={rr * 0.35} fill={fill} /> : <circle r={rr} fill={fill} />);
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x} ${p.y}) scale(${strong ? 1.25 : 1})`}
                  opacity={dim ? 0.3 : 1}
                  className="cursor-pointer outline-none transition-transform duration-200"
                  role="button"
                  tabIndex={n.degree > 0 ? 0 : -1}
                  aria-label={n.name}
                  aria-pressed={strong}
                  onClick={() => n.degree > 0 && show(n.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && n.degree > 0 && show(n.id)}
                >
                  <clipPath id={`clip-${n.id}`}>{ev ? <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={r * 0.35} /> : <circle r={r} />}</clipPath>
                  {shape(r + (ring ? 3.5 : 1.5), ring ? "var(--fire)" : "var(--surface)")}
                  {shape(r, n.degree === 0 ? "var(--ink)" : "var(--surface-sunk)")}
                  {n.avatar ? (
                    <image href={n.avatar} x={-r} y={-r} width={r * 2} height={r * 2} clipPath={`url(#clip-${n.id})`} preserveAspectRatio="xMidYMid slice" />
                  ) : (
                    <text textAnchor="middle" dominantBaseline="central" fontSize={r * 0.75} fontWeight={700} fill={n.degree === 0 ? "var(--paper)" : "var(--ink)"}>
                      {ev ? "★" : initials(n.name)}
                    </text>
                  )}
                  {(n.degree === 1 || strong) && (
                    <text y={r + 13} textAnchor="middle" fontSize={11 * Math.min(s, 1.2)} fontWeight={strong ? 700 : 400} fill={strong ? "var(--ink)" : "var(--ink-muted)"} stroke="var(--paper)" strokeWidth={4} paintOrder="stroke" strokeLinejoin="round">
                      {ev ? (n.name.length > 18 ? `${n.name.slice(0, 17)}…` : n.name) : n.name.split(" ")[0]}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {firstCount === 0 && eventCount === 0 && (
          <p className="absolute inset-x-0 top-[calc(50%+48px)] px-6 text-center text-ink-muted">your graph grows with every handshake.</p>
        )}
      </div>

      {/* The deck: swipe through the graph card by card; the card in view lights up on the graph. */}
      {cards.length > 0 && (
        <div className="mx-auto w-full max-w-md pb-2">
          <ul
            ref={deck}
            onScroll={onDeckScroll}
            aria-label="people and events in your graph"
            className="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-[7.5%] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {cards.map((n) => (
              <li key={n.id} className="w-[85%] shrink-0 snap-center">
                <div className={`flex items-center gap-3 rounded-[var(--radius-lg)] bg-surface p-3.5 shadow-[var(--shadow-card)] transition-opacity ${n.id === current ? "" : "opacity-60"}`}>
                  {n.kind === "event" ? (
                    n.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={n.avatar} alt="" className="h-12 w-12 shrink-0 rounded-[var(--radius-md)] object-cover" />
                    ) : (
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius-md)] bg-surface-sunk font-bold">★</span>
                    )
                  ) : (
                    <Avatar name={n.name} size={48} src={n.avatar} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{n.name}</p>
                    <p className="truncate text-sm text-ink-muted">{n.role}</p>
                    <p className="meta truncate">{[n.city, via(n)].filter(Boolean).join(" · ")}</p>
                  </div>
                  {n.href && (
                    <Link href={n.href} className={buttonClass("secondary", "sm")}>
                      {n.kind === "event" ? "open" : "profile"}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="meta mt-1 text-center">
            {Math.max(1, cards.findIndex((c) => c.id === current) + 1)} / {cards.length} · swipe to walk your graph
          </p>
        </div>
      )}
    </div>
  );
}
