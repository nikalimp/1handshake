import Link from "next/link";
import { AutoSubmit } from "@/components/admin/member-actions";
import { EventPanel } from "@/components/admin/event-panel";
import { Chips, DateField, PageHeader, Pager, queryHref, SearchRow, Select } from "@/components/admin/filters";
import { adminBase, requireAdmin } from "@/lib/admin";
import { coverUrl, formatWhen } from "@/lib/event-format";

export const metadata = { title: "events" };

const PAGE = 50;
type Params = { status?: string; city?: string; from?: string; to?: string; q?: string; page?: string; e?: string };
type Row = {
  id: string;
  slug: string;
  title: string;
  cover_path: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  online: boolean;
  city: string | null;
  venue: string | null;
  review: "pending" | "approved" | "rejected";
  review_note: string | null;
  cancelled_at: string | null;
  host_id: string;
  host_name: string | null;
  going: number;
  checked_in: number;
  connections: number;
  total: number;
};

const STATUSES = [
  { key: "all", label: "all" },
  { key: "pending", label: "waiting review" },
  { key: "approved", label: "approved" },
  { key: "rejected", label: "rejected" },
  { key: "cancelled", label: "cancelled" },
];

export default async function Events({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase } = await requireAdmin();
  const base = await adminBase();
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page) || 0);
  const status = STATUSES.some((s) => s.key === sp.status && s.key !== "all") ? sp.status! : null;
  const date = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const to = date(sp.to);

  const [{ data, error }, { data: cityRows }, { data: badges }] = await Promise.all([
    supabase.rpc("admin_events", {
      p_status: status,
      p_from: date(sp.from) ? `${sp.from}T00:00:00Z` : null,
      p_to: to ? new Date(new Date(`${to}T00:00:00Z`).getTime() + 86_400_000).toISOString() : null,
      p_city: sp.city && /^\d+$/.test(sp.city) ? Number(sp.city) : null,
      p_q: sp.q?.trim() || null,
      p_limit: PAGE,
      p_offset: page * PAGE,
    }),
    supabase.from("events").select("city_id").not("city_id", "is", null).returns<{ city_id: number }[]>(),
    supabase.rpc("admin_badges").maybeSingle<{ events: number }>(),
  ]);
  const rows = (data ?? []) as Row[];
  const total = Number(rows[0]?.total ?? 0);
  const ids = [...new Set((cityRows ?? []).map((r) => r.city_id))];
  const { data: cities } = ids.length ? await supabase.from("cities").select("id, name").in("id", ids).order("name").returns<{ id: number; name: string }[]>() : { data: [] };

  const current = { ...sp } as Record<string, string | undefined>;
  const href = (patch: Record<string, string | undefined>) => queryHref(`${base}/events`, current, patch);
  const waiting = Number(badges?.events ?? 0);

  return (
    <>
      <PageHeader title="events" meta={`${total} ${status || sp.q || sp.city || sp.from || sp.to ? "found" : "in total"}`} />
      <div className="mb-3">
        <Chips
          items={STATUSES.map((s) => (s.key === "pending" ? { ...s, n: waiting } : s))}
          current={status ?? "all"}
          href={(k) => href({ status: k === "all" ? undefined : k, page: undefined, e: undefined })}
        />
      </div>
      <form id="events-filters" action={`${base}/events`} method="get" className="mb-4 flex flex-col gap-2 rounded-[var(--radius-lg)] bg-surface p-3 shadow-[var(--shadow-card)]">
        <AutoSubmit formId="events-filters" />
        {status && <input type="hidden" name="status" value={status} />}
        <SearchRow value={sp.q} placeholder="search title or host" />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <Select name="city" label="city" value={sp.city} options={(cities ?? []).map((c) => ({ value: String(c.id), label: c.name.toLowerCase() }))} />
          <DateField name="from" label="starts from" value={sp.from} />
          <DateField name="to" label="starts to" value={sp.to} />
        </div>
      </form>

      {error && <p className="py-6 text-ink-muted">couldn&apos;t load events. try again in a minute.</p>}

      <ul className="flex flex-col gap-2">
        {rows.map((e) => {
          const cover = coverUrl(e.cover_path);
          const on = sp.e === e.id;
          return (
            <li key={e.id}>
              <Link
                href={href({ e: e.id })}
                scroll={false}
                className={`flex items-center gap-3 rounded-[var(--radius-md)] p-3 shadow-[var(--shadow-card)] ${on ? "bg-fire-soft" : "bg-surface hover:bg-surface-sunk"}`}
              >
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" className="h-14 w-14 shrink-0 rounded-[var(--radius-sm)] object-cover" />
                ) : (
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-surface-sunk text-xl">🎟</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-semibold">{e.title}</span>
                    <EventStatus review={e.review} cancelled={Boolean(e.cancelled_at)} />
                  </span>
                  <span className="meta block truncate">
                    {formatWhen(e)} · {e.online ? "online" : (e.city ?? "—").toLowerCase()} · by {(e.host_name ?? "a ghost").toLowerCase()}
                  </span>
                </span>
                <span className="hidden shrink-0 text-right font-mono text-xs text-ink-muted sm:block">
                  🙋 {e.going} · ✓ {e.checked_in}
                  <br />🎟 {e.connections} connections
                </span>
              </Link>
            </li>
          );
        })}
        {rows.length === 0 && !error && <li className="rounded-[var(--radius-md)] bg-surface p-6 text-center text-ink-muted shadow-[var(--shadow-card)]">no events here</li>}
      </ul>
      <Pager page={page} total={total} size={PAGE} href={(p) => href({ page: String(p), e: undefined })} />

      {sp.e && /^[0-9a-f-]{36}$/.test(sp.e) && <EventPanel id={sp.e} base={base} closeHref={href({ e: undefined })} />}
    </>
  );
}

function EventStatus({ review, cancelled }: { review: string; cancelled: boolean }) {
  const label = cancelled ? "cancelled" : review === "pending" ? "waiting review" : review;
  const tone = cancelled || review === "rejected" ? "bg-surface-sunk text-ink-muted" : review === "pending" ? "bg-fire-soft text-fire-ink" : "bg-surface-sunk text-ink";
  return <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${tone}`}>{label}</span>;
}
