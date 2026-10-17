import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { DismissMemberReports, EventReview, OfferAdminControls } from "@/components/admin/admin-controls";
import { AutoSubmit } from "@/components/admin/member-actions";
import { Markdown } from "@/components/markdown";
import { adminBase, requireAdmin } from "@/lib/admin";
import { ago, fmtDay } from "@/lib/admin-format";
import { APP_URL } from "@/lib/env";
import { coverUrl, formatWhen } from "@/lib/event-format";
import { signedUrls } from "@/lib/files";
import { Decision } from "./decision";

export const metadata = { title: "moderation" };

type Item = { kind: "handshake" | "event" | "offer" | "member"; target_id: string; since: string; reports: number; reasons: string[] | null; data: Record<string, string | null> };
type Person = { id: string; name: string | null; handle: string | null; avatar_path: string | null; status: string };
type LogRow = { id: number; created_at: string; action: string; target_type: string | null; target_id: string | null; reason: string | null; meta: Record<string, unknown>; admin_name: string | null; target_label: string | null };

const ACTIONS: Record<string, string> = {
  ban: "banned",
  unban: "unbanned",
  hide_post: "hid a post",
  close_offer: "closed an offer",
  hide_offer: "hid an offer",
  keep_offer: "kept an offer",
  delete_offer: "deleted an offer",
  resolve_member_reports: "dismissed reports",
  approve_event: "approved an event",
  reject_event: "rejected an event",
  cancel_event: "cancelled an event",
  new_checkin_code: "made a new check-in code",
  keep_handshake: "kept a handshake",
  cancel_handshake: "cancelled a handshake",
  view_member: "opened a member card",
};

export default async function Moderation({ searchParams }: { searchParams: Promise<{ action?: string; before?: string }> }) {
  const { supabase } = await requireAdmin();
  const base = await adminBase();
  const sp = await searchParams;
  const action = sp.action && sp.action in ACTIONS ? sp.action : null;
  const before = sp.before && /^\d+$/.test(sp.before) ? Number(sp.before) : null;

  const [{ data: queueData, error }, { data: logData }] = await Promise.all([
    supabase.rpc("admin_queue"),
    supabase.rpc("admin_log", { p_limit: 30, p_before: before, p_action: action }),
  ]);
  const queue = (queueData ?? []) as Item[];
  const log = (logData ?? []) as LogRow[];

  // Everyone the queue mentions, in one request; their photos, and the reported selfies.
  const ids = [
    ...new Set(
      queue.flatMap((q) => [q.data.inviter_id, q.data.guest_id, q.data.host_id, q.data.profile_id]).filter((x): x is string => Boolean(x)),
    ),
  ];
  const { data: rows } = ids.length ? await supabase.rpc("admin_people", { p_ids: ids }) : { data: [] };
  const people = new Map(((rows ?? []) as Person[]).map((p) => [p.id, p]));
  const [avatars, selfies] = await Promise.all([
    signedUrls(supabase, "avatars", ((rows ?? []) as Person[]).map((p) => p.avatar_path)),
    signedUrls(supabase, "selfies", queue.map((q) => q.data.selfie_path)),
  ]);
  const who = (id: string | null) => (id ? people.get(id) : undefined);
  const av = (p?: Person) => (p ? (avatars.get(p.avatar_path ?? "") ?? null) : null);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3 pt-4 pb-4 md:pt-0">
        <h1 className="text-[32px] leading-9 font-extrabold tracking-[-0.03em]">moderation</h1>
        <p className="meta">{queue.length} waiting · oldest first</p>
      </header>

      {error && <p className="py-6 text-ink-muted">couldn&apos;t load the queue. try again in a minute.</p>}
      {queue.length === 0 && !error && (
        <p className="rounded-[var(--radius-lg)] bg-surface p-6 text-center text-ink-muted shadow-[var(--shadow-card)]">nothing waiting. the club looks real. 🤝</p>
      )}

      <ul className="grid gap-3 lg:grid-cols-2">
        {queue.map((q) => (
          <li key={`${q.kind}-${q.target_id}`} className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-fire-soft px-2.5 py-1 font-mono text-[11px] text-fire-ink">{KIND[q.kind]}</span>
              <span className="meta">waiting {ago(q.since)}</span>
            </div>

            {q.kind === "handshake" && (
              <>
                {q.data.selfie_path && selfies.get(q.data.selfie_path) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selfies.get(q.data.selfie_path)} alt="the reported selfie" className="aspect-square w-full max-w-72 self-center rounded-[var(--radius-md)] object-cover" />
                ) : (
                  <div className="grid aspect-[2/1] place-items-center rounded-[var(--radius-md)] bg-surface-sunk text-ink-muted">no selfie</div>
                )}
                <Pair a={who(q.data.inviter_id)} b={who(q.data.guest_id)} base={base} av={av} />
                <p className="meta">
                  met {fmtDay(q.data.met_at)}
                  {q.data.flagged_at ? " · selfie hidden" : ""}
                </p>
                <Reasons q={q} />
                <Decision inviteId={q.target_id} names={`${who(q.data.inviter_id)?.name ?? "a member"} and ${who(q.data.guest_id)?.name ?? "a member"}`} />
              </>
            )}

            {q.kind === "event" && (
              <>
                <a href={`${base}/events?e=${q.target_id}`} className="flex gap-3">
                  {coverUrl(q.data.cover_path) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverUrl(q.data.cover_path)!} alt="" className="h-16 w-16 shrink-0 rounded-[var(--radius-md)] object-cover" />
                  ) : (
                    <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[var(--radius-md)] bg-surface-sunk text-2xl">🎟</span>
                  )}
                  <span className="min-w-0">
                    <span className="block font-extrabold">{q.data.title}</span>
                    <span className="meta block">{formatWhen({ starts_at: q.data.starts_at!, ends_at: q.data.ends_at, timezone: q.data.timezone ?? "UTC" })}</span>
                    <span className="block text-sm text-ink-muted">
                      {q.data.online === "true" ? "online" : (q.data.city ?? "").toLowerCase()} · by {who(q.data.host_id)?.name ?? "a member"}
                    </span>
                  </span>
                </a>
                <a href={`${APP_URL}/events/${q.data.slug}`} target="_blank" rel="noopener" className="meta w-fit hover:text-ink">
                  open in the app ↗
                </a>
                <EventReview id={q.target_id} />
              </>
            )}

            {q.kind === "offer" && (
              <>
                <div className="min-w-0">
                  <p className="meta">{q.data.kind}{q.data.price ? ` · ${q.data.price}` : ""}</p>
                  <h2 className="text-[17px] leading-6 font-bold">{q.data.title}</h2>
                  {q.data.body_md && (
                    <div className="mt-1 line-clamp-4 text-sm text-ink-muted">
                      <Markdown source={q.data.body_md} />
                    </div>
                  )}
                  {q.data.link && (
                    <a href={q.data.link} target="_blank" rel="noopener nofollow" className="meta hover:text-ink">
                      {q.data.link.replace(/^https:\/\/(www\.)?/, "")} ↗
                    </a>
                  )}
                </div>
                <PersonLine p={who(q.data.profile_id)} base={base} av={av} />
                <Reasons q={q} extra={q.data.flagged_at ? "hidden until you decide" : undefined} />
                <OfferAdminControls id={q.target_id} closed={Boolean(q.data.closed_at)} hidden={false} flagged={Boolean(q.data.flagged_at)} />
                {!q.data.flagged_at && <p className="meta">still visible: fewer than 3 reports. keep closes the reports.</p>}
              </>
            )}

            {q.kind === "member" && (
              <>
                <PersonLine p={who(q.data.profile_id)} base={base} av={av} big />
                <Reasons q={q} />
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`${base}/members?m=${q.target_id}`} className="inline-flex h-9 items-center rounded-full bg-fire px-3.5 text-sm font-semibold text-on-fire">
                    open card · ban
                  </Link>
                  <DismissMemberReports id={q.target_id} />
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      <section className="mt-10 flex flex-col gap-3" aria-label="admin log">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[24px] leading-7 font-extrabold tracking-[-0.02em]">log</h2>
          <form id="log-filter" action={`${base}/moderation`} method="get">
            <AutoSubmit formId="log-filter" />
            <label className="flex items-center gap-2">
              <span className="meta">show</span>
              <select name="action" defaultValue={action ?? ""} className="h-9 rounded-full bg-surface-sunk px-3 text-sm">
                <option value="">all actions</option>
                {Object.entries(ACTIONS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </form>
        </div>
        <ol className="overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]">
          {log.map((l) => (
            <li key={l.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-line px-4 py-2.5 text-sm last:border-0">
              <span className="font-semibold">{l.admin_name ?? "an admin"}</span>
              <span>{ACTIONS[l.action] ?? l.action.replace(/_/g, " ")}</span>
              {l.target_label && <Target l={l} base={base} />}
              {l.reason && <span className="text-ink-muted">— {l.reason}</span>}
              <span className="meta ml-auto">{fmtDay(l.created_at)}</span>
            </li>
          ))}
          {log.length === 0 && <li className="px-4 py-6 text-center text-ink-muted">no actions yet</li>}
        </ol>
        <div className="flex justify-between">
          {before ? (
            <Link href={`${base}/moderation${action ? `?action=${action}` : ""}`} className="meta hover:text-ink">
              ← newest
            </Link>
          ) : (
            <span />
          )}
          {log.length === 30 && (
            <Link href={`${base}/moderation?${new URLSearchParams({ ...(action ? { action } : {}), before: String(log[log.length - 1].id) })}`} className="meta hover:text-ink">
              older →
            </Link>
          )}
        </div>
      </section>
    </>
  );
}

const KIND = { handshake: "fake handshake?", event: "event to review", offer: "reported offer", member: "reported member" } as const;

function Reasons({ q, extra }: { q: Item; extra?: string }) {
  if (!q.reports) return null;
  return (
    <p className="text-sm">
      <span className="font-semibold">
        {q.reports} {Number(q.reports) === 1 ? "report" : "reports"}
      </span>
      {q.reasons?.length ? <span className="text-ink-muted"> · {q.reasons.join(" · ")}</span> : null}
      {extra && <span className="text-fire-ink"> · {extra}</span>}
    </p>
  );
}

function PersonLine({ p, base, av, big }: { p?: Person; base: string; av: (p?: Person) => string | null; big?: boolean }) {
  if (!p) return <p className="meta">a member</p>;
  return (
    <Link href={`${base}/members?m=${p.id}`} className="flex items-center gap-2 hover:underline">
      <Avatar name={p.name} size={big ? 40 : 24} src={av(p)} />
      <span className={big ? "text-[17px] font-bold" : "text-sm font-semibold"}>{p.name ?? "a ghost"}</span>
      {p.handle && <span className="meta">@{p.handle}</span>}
      {p.status !== "active" && <span className="meta">· {p.status}</span>}
    </Link>
  );
}

function Pair({ a, b, base, av }: { a?: Person; b?: Person; base: string; av: (p?: Person) => string | null }) {
  const one = (p?: Person): ReactNode =>
    p ? (
      <Link href={`${base}/members?m=${p.id}`} className="hover:underline">
        {p.name ?? "a ghost"}
      </Link>
    ) : (
      "a member"
    );
  return (
    <div className="flex items-center gap-3">
      <span className="flex">
        <Avatar name={a?.name ?? null} size={36} src={av(a)} />
        <span className="-ml-2">
          <Avatar name={b?.name ?? null} size={36} src={av(b)} />
        </span>
      </span>
      <p className="font-semibold">
        {one(a)} & {one(b)}
      </p>
    </div>
  );
}

function Target({ l, base }: { l: LogRow; base: string }) {
  const href =
    l.target_type === "profile" && l.target_id
      ? `${base}/members?m=${l.target_id}`
      : l.target_type === "event" && l.target_id
        ? `${base}/events?e=${l.target_id}`
        : l.target_type === "offer" && typeof l.meta?.profile_id === "string"
          ? `${base}/offers?author=${l.meta.profile_id}`
          : null;
  return href ? (
    <Link href={href} className="underline decoration-line hover:decoration-ink">
      {l.target_label}
    </Link>
  ) : (
    <span>{l.target_label}</span>
  );
}
