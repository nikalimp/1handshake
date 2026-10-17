import Link from "next/link";
import type { ReactNode } from "react";
import { WeeklyBars } from "@/components/admin/charts";
import { adminBase, PERIODS, periodRange, requireAdmin } from "@/lib/admin";
import { type AdminStats, type RetentionRow, type TimeRow, compact, pct, seriesOf, weekLabel, weekRange } from "@/lib/admin-stats";

export const metadata = { title: "overview" };

const OFFER_KINDS = ["order", "project", "product", "service"] as const;

export default async function Overview({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { supabase } = await requireAdmin();
  const base = await adminBase();
  const sp = await searchParams;
  const { period, from, to } = periodRange(sp.period);

  const [{ data: statsData, error }, { data: tsData }, { data: retData }] = await Promise.all([
    supabase.rpc("admin_stats", { p_from: from, p_to: to }),
    supabase.rpc("admin_timeseries", { p_from: from, p_to: to }),
    supabase.rpc("admin_retention", { p_weeks: 12 }),
  ]);
  if (error || !statsData) return <p className="py-10 text-ink-muted">couldn&apos;t load the numbers. try again in a minute.</p>;

  const s = statsData as AdminStats;
  const rows = (tsData ?? []) as TimeRow[];
  const weeks = weekRange(rows, from);
  const series = (metric: string) => seriesOf(rows, weeks, metric);
  const perWeek = weeks.length ? s.north_star.accepted / weeks.length : 0;
  const funnelWeeks = weeks.slice(-8).reverse();
  const req = s.activity.requests;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4 pt-4 pb-6 md:pt-0">
        <h1 className="text-[32px] leading-9 font-extrabold tracking-[-0.03em]">overview</h1>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="period" className="flex gap-1 rounded-full bg-surface-sunk p-1 text-sm font-semibold">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={`${base || "/"}?period=${p.key}`}
                aria-current={p.key === period.key ? "true" : undefined}
                className={`rounded-full px-3 py-1.5 ${p.key === period.key ? "bg-surface text-ink shadow-[var(--shadow-card)]" : "text-ink-muted hover:text-ink"}`}
              >
                {p.label}
              </Link>
            ))}
          </nav>
          <a href={`${base}/export?period=${period.key}`} className="inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold shadow-[inset_0_0_0_1.5px_var(--line-strong)]" download>
            csv ↓
          </a>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {/* North Star */}
        <Card className="md:col-span-2">
          <div className="grid gap-6 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] md:items-end">
            <div>
              <p className="text-sm font-semibold text-ink-muted">north star · intros accepted</p>
              <p className="mt-1 text-[56px] leading-[60px] font-extrabold tracking-[-0.04em]">{compact(s.north_star.accepted)}</p>
              <p className="meta mt-1">
                {period.days ? `in ${period.label}` : "all time"} · {compact(perWeek)} a week · {s.north_star.last_7d} in the last 7 days
              </p>
            </div>
            <WeeklyBars label="intros accepted per week" weeks={weeks} series={[{ key: "a", label: "intros accepted", color: "var(--fire)", values: series("intros_accepted") }]} />
          </div>
        </Card>

        {/* Invite funnel */}
        <Card title="invite funnel" note="codes made in the period. a member scanning a member's code is a handshake, not a join">
          <Funnel
            steps={[
              { label: "codes made", n: s.funnel.created },
              { label: "scanned", n: s.funnel.scanned },
              { label: "joined", n: s.funnel.joined },
            ]}
          />
          <p className="meta">+ {s.funnel.member_handshakes} handshakes between members</p>
          <table className="w-full text-sm">
            <caption className="sr-only">funnel by week</caption>
            <thead>
              <tr className="meta text-left">
                <th className="py-1 font-normal">week</th>
                <th className="py-1 text-right font-normal">made</th>
                <th className="py-1 text-right font-normal">scanned</th>
                <th className="py-1 text-right font-normal">joined</th>
                <th className="py-1 text-right font-normal">conv.</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {funnelWeeks.map((w) => {
                const i = weeks.indexOf(w);
                const made = series("invites_created")[i];
                const joined = series("invites_joined")[i];
                return (
                  <tr key={w} className="border-t border-line">
                    <td className="py-1.5 whitespace-nowrap">{weekLabel(w)}</td>
                    <td className="py-1.5 text-right">{made}</td>
                    <td className="py-1.5 text-right">{series("invites_scanned")[i]}</td>
                    <td className="py-1.5 text-right">{joined}</td>
                    <td className="py-1.5 text-right">{pct(joined, made)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        {/* Members */}
        <Card title="members" note="as of now">
          <Tiles>
            <Tile label="active" value={s.members.active} />
            <Tile label="new · 7 days" value={s.members.new_7d} />
            <Tile label="new · 30 days" value={s.members.new_30d} />
            {(period.key === "90" || period.key === "all") && <Tile label={period.key === "all" ? "joined, all time" : "new · 90 days"} value={s.members.new} />}
            <Tile label="ghosts 👻" value={s.members.ghost} />
            <Tile label="banned" value={s.members.banned} />
          </Tiles>
          <div className="grid gap-5 sm:grid-cols-2">
            <HBars title="by city" rows={s.members.by_city.map((c) => ({ label: c.name, n: c.n }))} />
            <HBars title="by sphere" rows={s.members.by_sphere.map((c) => ({ label: c.name, n: c.n }))} />
          </div>
        </Card>

        {/* Activity */}
        <Card title="active members" note="a member is active on a day they open the app. counted since this panel launched">
          <Tiles>
            <Tile label="today" value={s.activity.dau} />
            <Tile label="7 days" value={s.activity.wau} />
            <Tile label="30 days" value={s.activity.mau} />
          </Tiles>
          <WeeklyBars label="active members per week" weeks={weeks} series={[{ key: "a", label: "active members", color: "var(--fire)", values: series("active_members") }]} />
        </Card>

        <Card title="connections" note="new connections per week by how they happened">
          <Tiles>
            <Tile label="🤝 met" value={s.activity.connections.met} />
            <Tile label="🔗 intro" value={s.activity.connections.intro} />
            <Tile label="🎟 at events" value={s.activity.connections.event} />
          </Tiles>
          <WeeklyBars
            label="connections per week by type"
            weeks={weeks}
            series={[
              { key: "met", label: "🤝 met", color: "var(--series-met)", values: series("connections_met") },
              { key: "intro", label: "🔗 intro", color: "var(--series-intro)", values: series("connections_intro") },
              { key: "event", label: "🎟 at events", color: "var(--series-event)", values: series("connections_event") },
            ]}
          />
        </Card>

        <Card title="intros and posts">
          <Tiles>
            <Tile label="requests sent" value={req.sent} />
            <Tile label="accepted" value={req.accepted} hint={pct(req.accepted, req.accepted + req.declined)} />
            <Tile label="declined" value={req.declined} />
            <Tile label="🔥 on intros" value={s.activity.fires} />
            <Tile label="wall posts" value={s.activity.wall_posts} />
            <Tile label="🔥 on posts" value={s.activity.post_fires} />
          </Tiles>
        </Card>

        <Card title="events">
          <Tiles>
            <Tile label="created" value={s.events.created} />
            <Tile label="approved" value={s.events.approved} />
            <Tile label="waiting review" value={s.events.pending} />
            <Tile label="🙋 going" value={s.events.going} />
            <Tile label="check-ins" value={s.events.checkins} />
            <Tile label="🎟 connections" value={s.events.connections} />
          </Tiles>
        </Card>

        <Card title="offers" note="offers created in the period, by what they are now">
          <table className="w-full text-sm">
            <caption className="sr-only">offers by kind</caption>
            <thead>
              <tr className="meta text-left">
                <th className="py-1 font-normal">kind</th>
                <th className="py-1 text-right font-normal">open</th>
                <th className="py-1 text-right font-normal">closed</th>
              </tr>
            </thead>
            <tbody>
              {OFFER_KINDS.map((k) => (
                <tr key={k} className="border-t border-line">
                  <td className="py-1.5">{k}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{s.offers.by_kind[k]?.open ?? 0}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{s.offers.by_kind[k]?.closed ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="meta">{s.offers.interest} × i&apos;m interested</p>
        </Card>

        <Card title="network" note="active members only, as of now">
          <Tiles>
            <Tile label="connections" value={s.network.edges} />
            <Tile label="avg per member" value={s.network.avg_degree} />
            <Tile label="only their inviter" value={s.network.lonely} hint={pct(s.network.lonely, s.network.members)} />
            <Tile label="invite tree depth" value={s.network.tree_depth ?? 0} />
            <Tile label="push devices" value={s.push.devices} hint={`${s.push.members} members`} />
          </Tiles>
        </Card>

        <Card title="retention" note="members who joined in a week (rows) and opened the app n weeks later. counted since this panel launched" className="md:col-span-2">
          <Retention rows={(retData ?? []) as RetentionRow[]} />
        </Card>
      </div>
    </>
  );
}

function Card({ title, note, className = "", children }: { title?: string; note?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`flex min-w-0 flex-col gap-4 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-card)] ${className}`} aria-label={title}>
      {title && (
        <div>
          <h2 className="text-[20px] leading-6 font-extrabold tracking-[-0.02em]">{title}</h2>
          {note && <p className="meta mt-1">{note}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

function Tiles({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>;
}

function Tile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-surface-sunk px-3 py-2.5">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="text-[24px] leading-8 font-bold tracking-[-0.02em]">
        {compact(Number(value))}
        {hint && <span className="meta ml-1.5 align-middle">{hint}</span>}
      </p>
    </div>
  );
}

function Funnel({ steps }: { steps: { label: string; n: number }[] }) {
  const top = Math.max(1, steps[0]?.n ?? 0);
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((st, i) => (
        <li key={st.label} className="grid grid-cols-[88px_minmax(0,1fr)_72px] items-center gap-3 text-sm">
          <span className="text-ink-muted">{st.label}</span>
          <span className="h-3 rounded-r-[4px] bg-fire" style={{ width: `${Math.max(1, (st.n / top) * 100)}%`, opacity: 1 - i * 0.2 }} />
          <span className="text-right font-mono tabular-nums">
            {st.n}
            {i > 0 && <span className="text-ink-muted"> · {pct(st.n, steps[0].n)}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function HBars({ title, rows }: { title: string; rows: { label: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length === 0 && <p className="meta">no data yet</p>}
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)_32px] items-center gap-2 text-sm">
            <span className="truncate lowercase">{r.label}</span>
            <span className="h-2.5 rounded-r-[4px] bg-fire" style={{ width: `${(r.n / max) * 100}%` }} />
            <span className="text-right font-mono tabular-nums">{r.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Retention({ rows }: { rows: RetentionRow[] }) {
  const cohorts = [...new Set(rows.map((r) => String(r.cohort).slice(0, 10)))].sort().reverse();
  if (cohorts.length === 0) return <p className="meta">no cohorts yet</p>;
  const maxN = Math.min(12, Math.max(0, ...rows.map((r) => r.week_n ?? 0)));
  const cell = (c: string, n: number) => rows.find((r) => String(r.cohort).slice(0, 10) === c && r.week_n === n);
  return (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <caption className="sr-only">weekly retention by cohort</caption>
        <thead>
          <tr className="meta">
            <th className="py-1 pr-3 text-left font-normal">joined</th>
            <th className="py-1 pr-3 text-right font-normal">members</th>
            {Array.from({ length: maxN + 1 }, (_, n) => (
              <th key={n} className="min-w-11 py-1 text-center font-normal">
                w{n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {cohorts.map((c) => {
            const size = Number(rows.find((r) => String(r.cohort).slice(0, 10) === c)?.size ?? 0);
            return (
              <tr key={c}>
                <td className="py-0.5 pr-3 whitespace-nowrap">{weekLabel(c)}</td>
                <td className="py-0.5 pr-3 text-right">{size}</td>
                {Array.from({ length: maxN + 1 }, (_, n) => {
                  const r = cell(c, n);
                  const share = r && size ? Number(r.active) / size : 0;
                  return (
                    <td key={n} className="p-0.5">
                      <span
                        className="grid h-7 min-w-11 place-items-center rounded-[6px] px-1 text-[11px]"
                        style={{
                          background: share ? `color-mix(in oklab, var(--fire) ${Math.round(15 + share * 70)}%, var(--surface))` : "var(--surface-sunk)",
                          color: share >= 0.75 ? "var(--on-fire)" : undefined,
                        }}
                        title={r ? `${r.active} of ${size}` : "no activity"}
                      >
                        {r ? `${Math.round(share * 100)}%` : ""}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
