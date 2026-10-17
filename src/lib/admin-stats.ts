// Shapes of the admin stats RPCs and helpers to turn weekly rows into chart series.

export type AdminStats = {
  north_star: { accepted: number; last_7d: number };
  funnel: { created: number; scanned: number; joined: number; member_handshakes: number };
  members: {
    active: number;
    ghost: number;
    banned: number;
    new: number;
    new_7d: number;
    new_30d: number;
    by_city: { name: string; country: string | null; n: number }[];
    by_sphere: { name: string; n: number }[];
  };
  activity: {
    dau: number;
    wau: number;
    mau: number;
    connections: { met: number; intro: number; event: number };
    requests: { sent: number; accepted: number; declined: number };
    fires: number;
    post_fires: number;
    wall_posts: number;
  };
  events: { created: number; approved: number; pending: number; going: number; checkins: number; connections: number };
  offers: { by_kind: Record<string, { open: number; closed: number }>; interest: number };
  network: { members: number; edges: number; avg_degree: number; lonely: number; tree_depth: number | null };
  push: { devices: number; members: number };
};

export type TimeRow = { week: string; metric: string; value: number };
export type RetentionRow = { cohort: string; size: number; week_n: number | null; active: number | null };

export const METRICS: { key: string; label: string }[] = [
  { key: "intros_accepted", label: "intros accepted (north star)" },
  { key: "intros_sent", label: "intro requests sent" },
  { key: "intros_declined", label: "intro requests declined" },
  { key: "invites_created", label: "invite codes made" },
  { key: "invites_scanned", label: "invite codes scanned" },
  { key: "invites_joined", label: "joined via invite" },
  { key: "members_new", label: "new members" },
  { key: "active_members", label: "active members" },
  { key: "connections_met", label: "connections 🤝 met" },
  { key: "connections_intro", label: "connections 🔗 intro" },
  { key: "connections_event", label: "connections 🎟 at events" },
  { key: "fires", label: "fires on intros" },
  { key: "post_fires", label: "fires on posts" },
  { key: "wall_posts", label: "wall posts" },
  { key: "events_created", label: "events created" },
  { key: "checkins", label: "event check-ins" },
  { key: "offers_created", label: "offers created" },
  { key: "offer_interest", label: "offer interest" },
];

/** Monday of the UTC week, as "YYYY-MM-DD". */
export function weekOf(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

/** Every week from `from` (or the first week with data) to this week, so empty weeks show as zeros. */
export function weekRange(rows: TimeRow[], from: string | null, now = new Date()) {
  const first = from ? weekOf(new Date(from)) : rows.reduce((m, r) => (String(r.week).slice(0, 10) < m ? String(r.week).slice(0, 10) : m), weekOf(now));
  const out: string[] = [];
  const end = weekOf(now);
  for (let d = new Date(`${first}T00:00:00Z`); out.length < 520; d.setUTCDate(d.getUTCDate() + 7)) {
    const w = d.toISOString().slice(0, 10);
    out.push(w);
    if (w >= end) break;
  }
  return out;
}

export function seriesOf(rows: TimeRow[], weeks: string[], metric: string) {
  const by = new Map(rows.filter((r) => r.metric === metric).map((r) => [String(r.week).slice(0, 10), Number(r.value)]));
  return weeks.map((w) => by.get(w) ?? 0);
}

export const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

const short = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
/** "12 oct" for a week's Monday. */
export const weekLabel = (iso: string) => short.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)).toLowerCase();
/** 1,284 → 1.3k; small numbers keep one decimal at most. */
export const compact = (n: number) =>
  n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(Math.round(n * 10) / 10);
