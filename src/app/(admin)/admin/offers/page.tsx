import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { OfferAdminControls } from "@/components/admin/admin-controls";
import { AutoSubmit } from "@/components/admin/member-actions";
import { Chips, PageHeader, Pager, queryHref, SearchRow, Select } from "@/components/admin/filters";
import { Markdown } from "@/components/markdown";
import { adminBase, requireAdmin } from "@/lib/admin";
import { fmtDay } from "@/lib/admin-format";
import { signedUrls } from "@/lib/files";
import { OFFER_KINDS } from "@/lib/offers";

export const metadata = { title: "offers" };

const PAGE = 40;
type Params = { status?: string; kind?: string; q?: string; author?: string; page?: string };
type Row = {
  id: string;
  kind: string;
  title: string;
  body_md: string;
  price: string | null;
  link: string | null;
  created_at: string;
  closed_at: string | null;
  hidden_at: string | null;
  hidden_reason: string | null;
  flagged_at: string | null;
  profile_id: string;
  author_name: string | null;
  author_handle: string | null;
  author_avatar: string | null;
  author_status: "active" | "ghost" | "banned";
  interest: number;
  open_reports: number;
  total: number;
};

const STATUSES = [
  { key: "all", label: "all" },
  { key: "flagged", label: "hidden by reports" },
  { key: "open", label: "open" },
  { key: "hidden", label: "hidden by admins" },
  { key: "closed", label: "closed" },
];

export default async function Offers({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase } = await requireAdmin();
  const base = await adminBase();
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page) || 0);
  const status = STATUSES.some((s) => s.key === sp.status && s.key !== "all") ? sp.status! : null;
  const kind = OFFER_KINDS.some((k) => k.id === sp.kind) ? sp.kind! : null;
  const author = sp.author && /^[0-9a-f-]{36}$/.test(sp.author) ? sp.author : null;

  const [{ data, error }, { data: badges }] = await Promise.all([
    supabase.rpc("admin_offers", { p_kind: kind, p_status: status, p_author: author, p_q: sp.q?.trim() || null, p_limit: PAGE, p_offset: page * PAGE }),
    supabase.rpc("admin_badges").maybeSingle<{ offers: number }>(),
  ]);
  const rows = (data ?? []) as Row[];
  const total = Number(rows[0]?.total ?? 0);
  const avatars = await signedUrls(supabase, "avatars", rows.map((r) => r.author_avatar));
  const current = { ...sp } as Record<string, string | undefined>;
  const href = (patch: Record<string, string | undefined>) => queryHref(`${base}/offers`, current, patch);
  const flagged = Number(badges?.offers ?? 0);

  return (
    <>
      <PageHeader title="offers" meta={`${total} ${status || kind || sp.q || author ? "found" : "in total"}`} />
      <div className="mb-3">
        <Chips
          items={STATUSES.map((s) => (s.key === "flagged" ? { ...s, n: flagged } : s))}
          current={status ?? "all"}
          href={(k) => href({ status: k === "all" ? undefined : k, page: undefined })}
        />
      </div>
      <form id="offers-filters" action={`${base}/offers`} method="get" className="mb-4 flex flex-col gap-2 rounded-[var(--radius-lg)] bg-surface p-3 shadow-[var(--shadow-card)]">
        <AutoSubmit formId="offers-filters" />
        {status && <input type="hidden" name="status" value={status} />}
        {author && <input type="hidden" name="author" value={author} />}
        <SearchRow value={sp.q} placeholder="search title or author" />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <Select name="kind" label="kind" value={sp.kind} options={OFFER_KINDS.map((k) => ({ value: k.id, label: k.label }))} />
        </div>
        {author && (
          <Link href={href({ author: undefined, page: undefined })} className="meta self-start px-1 hover:text-ink">
            one author only · show everyone ×
          </Link>
        )}
      </form>

      {error && <p className="py-6 text-ink-muted">couldn&apos;t load offers. try again in a minute.</p>}

      <ul className="grid gap-3 lg:grid-cols-2">
        {rows.map((o) => {
          const hidden = Boolean(o.hidden_at);
          const waiting = Boolean(o.flagged_at) && !hidden;
          const state = hidden ? "hidden by admins" : waiting ? "hidden by reports" : o.closed_at ? "closed" : "open";
          return (
            <li key={o.id} className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between gap-2">
                <span className="meta rounded-full bg-surface-sunk px-2.5 py-1 text-ink">{o.kind}</span>
                <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${hidden || waiting ? "bg-fire-soft text-fire-ink" : "bg-surface-sunk text-ink-muted"}`}>{state}</span>
              </div>
              <div className="min-w-0">
                <h2 className="text-[17px] leading-6 font-bold">{o.title}</h2>
                {o.body_md && (
                  <div className="mt-1 line-clamp-3 text-sm text-ink-muted">
                    <Markdown source={o.body_md} />
                  </div>
                )}
                <p className="meta mt-1">
                  {o.price ? `${o.price} · ` : ""}
                  {o.interest} interested · {fmtDay(o.created_at)}
                  {o.link && (
                    <>
                      {" · "}
                      <a href={o.link} target="_blank" rel="noopener nofollow" className="hover:text-ink">
                        link ↗
                      </a>
                    </>
                  )}
                </p>
                {hidden && o.hidden_reason && <p className="mt-2 rounded-[var(--radius-sm)] bg-surface-sunk px-3 py-2 text-sm">hidden: {o.hidden_reason}</p>}
                {Number(o.open_reports) > 0 && (
                  <p className="mt-2 text-sm text-fire-ink">
                    {o.open_reports} open {Number(o.open_reports) === 1 ? "report" : "reports"} ·{" "}
                    <Link href={`${base}/moderation`} className="underline">
                      in the queue
                    </Link>
                  </p>
                )}
              </div>
              <Link href={`${base}/members?m=${o.profile_id}`} className="flex items-center gap-2 text-sm hover:underline">
                <Avatar name={o.author_name} size={24} src={avatars.get(o.author_avatar ?? "") ?? null} />
                <span className="font-semibold">{o.author_name ?? "a ghost"}</span>
                {o.author_handle && <span className="meta">@{o.author_handle}</span>}
                {o.author_status !== "active" && <span className="meta">· {o.author_status}</span>}
              </Link>
              <OfferAdminControls id={o.id} closed={Boolean(o.closed_at)} hidden={hidden} flagged={waiting} />
            </li>
          );
        })}
        {rows.length === 0 && !error && <li className="rounded-[var(--radius-md)] bg-surface p-6 text-center text-ink-muted shadow-[var(--shadow-card)] lg:col-span-2">no offers here</li>}
      </ul>
      <Pager page={page} total={total} size={PAGE} href={(p) => href({ page: String(p) })} />
    </>
  );
}
