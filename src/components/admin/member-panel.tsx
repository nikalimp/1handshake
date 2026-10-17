import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { BanControl, CloseOfferButton, HidePostButton, PanelShell } from "@/components/admin/member-actions";
import { Markdown } from "@/components/markdown";
import { requireAdmin } from "@/lib/admin";
import { ago, fmtDay } from "@/lib/admin-format";
import { APP_URL, CARD_URL } from "@/lib/env";
import { signedUrls } from "@/lib/files";

type Status = "active" | "ghost" | "banned";
type Person = { id: string; handle: string | null; name: string | null; avatar_path?: string | null; status?: Status };
type Report = { id: string; reason: string; created_at: string; resolved_at: string | null; about: "handshake" | "post" | "member"; reporter?: Person };

type MemberCard = {
  profile: Person & {
    role: string | null;
    bio_md: string;
    status: Status;
    created_at: string;
    last_seen_at: string | null;
    deleted_at: string | null;
    links: Record<string, string> | null;
    open_to_hiring: boolean;
    open_to_network: boolean;
    is_admin: boolean;
    city: { id: number; name: string; country: string | null } | null;
    spheres: { id: number; name: string; primary: boolean }[];
    active_days_30: number;
  };
  join: {
    method: "founder" | "selfie" | "event";
    event: { id: string; slug: string; title: string; starts_at: string } | null;
    invite: { id: string; created_at: string; selfie_path: string | null } | null;
  };
  ancestors: (Person & { depth: number })[];
  invitees: (Person & { parent: string; depth: number; created_at: string })[];
  connections: { met: number; intro: number; event: number; list: (Person & { kind: "met" | "intro"; event_id: string | null; created_at: string })[] };
  events: {
    hosted: { id: string; slug: string; title: string; starts_at: string; review: string; cancelled_at: string | null }[];
    attended: { id: string; slug: string; title: string; starts_at: string; going_at: string | null; checked_in_at: string | null }[];
  };
  offers: { id: string; kind: string; title: string; price: string | null; closed_at: string | null; created_at: string; interest: number }[];
  posts: { id: string; body: string; created_at: string; fires: number; wall_owner: Person }[];
  reports_against: Report[];
  reports_by: Report[];
  actions: { action: string; reason: string | null; created_at: string; admin: string | null }[];
};

export function StatusChip({ status }: { status: Status }) {
  return (
    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${status === "banned" ? "bg-fire-soft text-fire-ink" : "bg-surface-sunk text-ink-muted"}`}>
      {status === "ghost" ? "👻 ghost" : status}
    </span>
  );
}

const JOIN = { founder: "founding member", selfie: "🤝 joined with a selfie", event: "🎟 joined with a selfie at an event" } as const;
const ACTION = { ban: "banned", unban: "unbanned", hide_post: "post hidden", close_offer: "offer closed" } as Record<string, string>;

/** The member card in the side panel. Opening it is logged in the database (admin_member). */
export async function MemberPanel({ id, base, closeHref }: { id: string; base: string; closeHref: string }) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_member", { p_id: id });
  if (error || !data) {
    return (
      <PanelShell closeHref={closeHref}>
        <PanelTop closeHref={closeHref} />
        <p className="px-5 text-ink-muted">member not found.</p>
      </PanelShell>
    );
  }
  const c = data as MemberCard;
  const p = c.profile;
  const people = [p, ...c.ancestors, ...c.invitees, ...c.connections.list];
  const [avatars, selfies] = await Promise.all([
    signedUrls(supabase, "avatars", people.map((x) => x.avatar_path)),
    signedUrls(supabase, "selfies", [c.join.invite?.selfie_path]),
  ]);
  const av = (x: Person) => avatars.get(x.avatar_path ?? "") ?? null;
  const open = (x: Person) => `${base}/members?m=${x.id}`;
  const selfie = c.join.invite?.selfie_path ? selfies.get(c.join.invite.selfie_path) : null;
  const chain = [...c.ancestors].reverse();

  return (
    <PanelShell closeHref={closeHref}>
      <PanelTop closeHref={closeHref} />
      <div className="flex flex-col gap-6 px-5 pb-16">
        <header className="flex items-start gap-4">
          <Avatar name={p.name} size={64} src={av(p)} />
          <div className="min-w-0 flex-1">
            <h2 className="text-[24px] leading-7 font-extrabold tracking-[-0.02em]">{p.name ?? "deleted account"}</h2>
            {p.role && <p className="text-ink-muted">{p.role}</p>}
            <p className="meta mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {p.handle && <span>@{p.handle}</span>}
              {p.status !== "active" && <StatusChip status={p.status} />}
              {p.is_admin && <span className="rounded-full bg-surface-sunk px-2 py-0.5 text-[10px]">admin</span>}
            </p>
            {p.handle && p.status === "active" && (
              <p className="meta mt-2 flex gap-3">
                <a href={`${APP_URL}/people/${p.handle}`} target="_blank" rel="noopener" className="hover:text-ink">
                  in the app ↗
                </a>
                <a href={`${CARD_URL}/@${p.handle}`} target="_blank" rel="noopener" className="hover:text-ink">
                  public card ↗
                </a>
              </p>
            )}
          </div>
        </header>

        {!p.is_admin && (
          <div className="flex">
            <BanControl id={p.id} status={p.status} name={p.name ?? "this member"} />
          </div>
        )}

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Fact label="city">{p.city ? p.city.name.toLowerCase() : "—"}</Fact>
          <Fact label="joined">{fmtDay(p.created_at)}</Fact>
          <Fact label="last seen">{ago(p.last_seen_at)}</Fact>
          <Fact label="active days · 30d">{p.active_days_30}</Fact>
          <Fact label="spheres" wide>
            {p.spheres.length ? p.spheres.map((s) => s.name.toLowerCase()).join(" · ") : "—"}
          </Fact>
          <Fact label="visibility" wide>
            {p.open_to_hiring ? "open to hiring" : "hidden from connect"} · {p.open_to_network ? "network open" : "network closed"}
          </Fact>
        </dl>

        {p.bio_md && (
          <details className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-card)]">
            <summary className="cursor-pointer font-semibold">card text</summary>
            <Markdown source={p.bio_md} className="mt-3 text-sm" />
          </details>
        )}

        <Section title="invite tree">
          <p className="text-sm">{JOIN[c.join.method]}</p>
          {c.join.event && (
            <p className="meta">
              at{" "}
              <a href={`${APP_URL}/events/${c.join.event.slug}`} target="_blank" rel="noopener" className="underline hover:text-ink">
                {c.join.event.title}
              </a>{" "}
              · {fmtDay(c.join.event.starts_at)}
            </p>
          )}
          {selfie && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selfie} alt="the joining selfie" className="aspect-square w-40 rounded-[var(--radius-md)] object-cover" />
          )}
          {chain.length > 0 && (
            <ol className="flex flex-col gap-1.5">
              {chain.map((a, i) => (
                <li key={a.id} style={{ paddingLeft: i * 14 }}>
                  <PersonLink person={a} href={open(a)} src={av(a)} />
                </li>
              ))}
              <li style={{ paddingLeft: chain.length * 14 }} className="flex items-center gap-2 text-sm font-semibold">
                <span className="text-ink-muted">└</span> {p.name ?? "ghost"}
              </li>
            </ol>
          )}
          <h4 className="mt-2 text-sm font-semibold">brought in {c.invitees.filter((x) => x.depth === 1).length} · {c.invitees.length} down the tree</h4>
          {c.invitees.length === 0 ? (
            <p className="meta">nobody yet</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {c.invitees.slice(0, 60).map((x) => (
                <li key={x.id} style={{ paddingLeft: (x.depth - 1) * 14 }} className="flex items-center gap-2">
                  {x.depth > 1 && <span className="text-ink-muted">└</span>}
                  <PersonLink person={x} href={open(x)} src={av(x)} hint={fmtDay(x.created_at)} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={`connections · ${c.connections.list.length}`}>
          <p className="meta">
            🤝 {c.connections.met} met · 🔗 {c.connections.intro} intro · 🎟 {c.connections.event} at events
          </p>
          <ul className="flex flex-col gap-1.5">
            {c.connections.list.slice(0, 30).map((x) => (
              <li key={x.id}>
                <PersonLink person={x} href={open(x)} src={av(x)} hint={`${x.event_id ? "🎟" : x.kind === "met" ? "🤝" : "🔗"} ${fmtDay(x.created_at)}`} />
              </li>
            ))}
          </ul>
          {c.connections.list.length > 30 && <p className="meta">+ {c.connections.list.length - 30} more</p>}
        </Section>

        <Section title="events">
          {c.events.hosted.length === 0 && c.events.attended.length === 0 && <p className="meta">none</p>}
          <ul className="flex flex-col gap-1.5 text-sm">
            {c.events.hosted.map((e) => (
              <li key={e.id}>
                <a href={`${APP_URL}/events/${e.slug}`} target="_blank" rel="noopener" className="font-semibold hover:underline">
                  {e.title}
                </a>
                <span className="meta"> · hosts · {fmtDay(e.starts_at)} · {e.cancelled_at ? "cancelled" : e.review}</span>
              </li>
            ))}
            {c.events.attended.map((e) => (
              <li key={e.id}>
                <a href={`${APP_URL}/events/${e.slug}`} target="_blank" rel="noopener" className="font-semibold hover:underline">
                  {e.title}
                </a>
                <span className="meta"> · {e.checked_in_at ? "checked in" : "going"} · {fmtDay(e.starts_at)}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="offers">
          {c.offers.length === 0 && <p className="meta">none</p>}
          <ul className="flex flex-col gap-2">
            {c.offers.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="font-semibold">{o.title}</span>
                  <span className="meta block">
                    {o.kind}
                    {o.price ? ` · ${o.price}` : ""} · {o.interest} interested · {o.closed_at ? `closed ${fmtDay(o.closed_at)}` : "open"}
                  </span>
                </span>
                {!o.closed_at && <CloseOfferButton id={o.id} />}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="wall posts">
          {c.posts.length === 0 && <p className="meta">none</p>}
          <ul className="flex flex-col gap-3">
            {c.posts.map((w) => (
              <li key={w.id} className="flex flex-col gap-1.5 rounded-[var(--radius-md)] bg-surface p-3 shadow-[var(--shadow-card)]">
                <p className="meta">
                  on {w.wall_owner.id === p.id ? "own wall" : `${w.wall_owner.name ?? "a ghost"}'s wall`} · {fmtDay(w.created_at)} · 🔥 {w.fires}
                </p>
                <p className="text-sm whitespace-pre-line">{w.body}</p>
                <div>
                  <HidePostButton id={w.id} />
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={`reports about them · ${c.reports_against.length}`}>
          <Reports rows={c.reports_against} base={base} />
        </Section>
        <Section title={`reports they filed · ${c.reports_by.length}`}>
          <Reports rows={c.reports_by} base={base} />
        </Section>

        <Section title="admin log">
          {c.actions.length === 0 ? (
            <p className="meta">no actions yet</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {c.actions.map((a, i) => (
                <li key={i}>
                  <span className="font-semibold">{ACTION[a.action] ?? a.action.replace(/_/g, " ")}</span>
                  {a.reason && <span> — {a.reason}</span>}
                  <span className="meta block">
                    {fmtDay(a.created_at)} · {a.admin ?? "an admin"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </PanelShell>
  );
}

function PanelTop({ closeHref }: { closeHref: string }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between bg-paper/95 px-5 py-3 backdrop-blur">
      <span className="meta">member</span>
      <Link href={closeHref} scroll={false} className="grid h-9 w-9 place-items-center rounded-full bg-surface-sunk text-lg" aria-label="close">
        ×
      </Link>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h3 className="text-[18px] leading-6 font-extrabold tracking-[-0.02em]">{title}</h3>
      {children}
    </section>
  );
}

function Fact({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`rounded-[var(--radius-md)] bg-surface-sunk px-3 py-2 ${wide ? "col-span-2" : ""}`}>
      <dt className="meta">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function PersonLink({ person, href, src, hint }: { person: Person; href: string; src: string | null; hint?: string }) {
  return (
    <Link href={href} scroll={false} className="inline-flex max-w-full items-center gap-2 text-sm hover:underline">
      <Avatar name={person.name} size={24} src={src} />
      <span className="truncate font-semibold">{person.name ?? "ghost"}</span>
      {person.status && person.status !== "active" && <StatusChip status={person.status} />}
      {hint && <span className="meta shrink-0">{hint}</span>}
    </Link>
  );
}

function Reports({ rows, base }: { rows: Report[]; base: string }) {
  if (rows.length === 0) return <p className="meta">none</p>;
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {rows.map((r) => (
        <li key={r.id}>
          <span className="font-semibold">{r.about}</span> — {r.reason}
          <span className="meta block">
            {fmtDay(r.created_at)}
            {r.reporter && (
              <>
                {" · by "}
                <Link href={`${base}/members?m=${r.reporter.id}`} scroll={false} className="hover:text-ink">
                  {r.reporter.name ?? "a ghost"}
                </Link>
              </>
            )}
            {r.resolved_at ? ` · resolved ${fmtDay(r.resolved_at)}` : " · open"}
          </span>
        </li>
      ))}
    </ul>
  );
}
