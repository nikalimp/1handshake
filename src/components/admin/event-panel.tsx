import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { EventAdminControls, NewCheckinCode } from "@/components/admin/admin-controls";
import { PanelShell } from "@/components/admin/member-actions";
import { requireAdmin } from "@/lib/admin";
import { fmtDay } from "@/lib/admin-format";
import { APP_URL, CARD_URL } from "@/lib/env";
import { coverUrl, formatWhen } from "@/lib/event-format";
import { signedUrls } from "@/lib/files";

type Person = { id: string; name: string | null; handle: string | null; avatar_path: string | null; status?: string; created_at?: string };
type EventCard = {
  event: {
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
    address: string | null;
    price: string | null;
    registration_url: string | null;
    source_url: string | null;
    review: "pending" | "approved" | "rejected";
    review_note: string | null;
    reviewed_at: string | null;
    cancelled_at: string | null;
    checkin_code: string;
    created_at: string;
    host: Person | null;
  };
  people: (Person & { going_at: string | null; checked_in_at: string | null })[];
  connections: number;
  joined: (Person & { invited_by: string; created_at: string })[];
  actions: { action: string; reason: string | null; created_at: string; admin: string | null }[];
};

const ACTION: Record<string, string> = {
  approve_event: "approved",
  reject_event: "rejected",
  cancel_event: "cancelled",
  new_checkin_code: "new check-in code",
};

/** One event in the side panel: review, cancel, check-in code, who came and what it brought. */
export async function EventPanel({ id, base, closeHref }: { id: string; base: string; closeHref: string }) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_event", { p_id: id });
  if (error || !data) {
    return (
      <PanelShell closeHref={closeHref}>
        <Top closeHref={closeHref} />
        <p className="px-5 text-ink-muted">event not found.</p>
      </PanelShell>
    );
  }
  const c = data as EventCard;
  const e = c.event;
  const avatars = await signedUrls(supabase, "avatars", [e.host?.avatar_path, ...c.people.map((p) => p.avatar_path), ...c.joined.map((p) => p.avatar_path)]);
  const av = (p: Person) => avatars.get(p.avatar_path ?? "") ?? null;
  const cover = coverUrl(e.cover_path);
  const checked = c.people.filter((p) => p.checked_in_at);
  const going = c.people.filter((p) => !p.checked_in_at && p.going_at);
  const cancelled = Boolean(e.cancelled_at);
  const status = cancelled ? "cancelled" : e.review === "pending" ? "waiting review" : e.review;

  return (
    <PanelShell closeHref={closeHref}>
      <Top closeHref={closeHref} />
      <div className="flex flex-col gap-6 px-5 pb-16">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="aspect-[2/1] w-full rounded-[var(--radius-md)] object-cover" />
        )}
        <header className="flex flex-col gap-1">
          <p className="meta">{status}</p>
          <h2 className="text-[24px] leading-7 font-extrabold tracking-[-0.02em]">{e.title}</h2>
          <p className="text-ink-muted">{formatWhen(e)}</p>
          <p className="text-sm">
            {e.online ? "online" : [e.venue, e.address, e.city].filter(Boolean).join(" · ") || "place not set"}
            {e.price ? ` · ${e.price}` : ""}
          </p>
          {e.host && (
            <Link href={`${base}/members?m=${e.host.id}`} scroll={false} className="mt-1 inline-flex w-fit items-center gap-2 text-sm hover:underline">
              <Avatar name={e.host.name} size={24} src={av(e.host)} />
              hosted by <span className="font-semibold">{e.host.name ?? "a ghost"}</span>
            </Link>
          )}
          {e.review === "rejected" && e.review_note && (
            <p className="mt-2 rounded-[var(--radius-sm)] bg-surface-sunk px-3 py-2 text-sm">rejected: {e.review_note}</p>
          )}
        </header>

        <EventAdminControls id={e.id} review={e.review} cancelled={cancelled} />

        <p className="meta flex flex-wrap gap-x-3 gap-y-1">
          <a href={`${APP_URL}/events/${e.slug}`} target="_blank" rel="noopener" className="hover:text-ink">
            open in the app ↗
          </a>
          <a href={`${APP_URL}/events/${e.slug}/edit`} target="_blank" rel="noopener" className="hover:text-ink">
            edit ↗
          </a>
          {e.review === "approved" && !cancelled && (
            <a href={`${CARD_URL}/e/${e.slug}`} target="_blank" rel="noopener" className="hover:text-ink">
              public page ↗
            </a>
          )}
          {e.source_url && (
            <a href={e.source_url} target="_blank" rel="noopener nofollow" className="hover:text-ink">
              source ↗
            </a>
          )}
        </p>

        <Section title="check-in">
          <div className="flex flex-wrap items-center gap-3">
            <code className="rounded-[var(--radius-sm)] bg-surface-sunk px-3 py-2 font-mono text-sm">{e.checkin_code}</code>
            <NewCheckinCode id={e.id} />
            <a href={`${APP_URL}/events/${e.slug}/qr`} target="_blank" rel="noopener" className="meta hover:text-ink">
              qr page ↗
            </a>
          </div>
          <p className="meta">works for members only, 3 hours before the start to 3 hours after the end, on approved events</p>
        </Section>

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Fact label="🙋 going">{c.people.filter((p) => p.going_at).length}</Fact>
          <Fact label="checked in">{checked.length}</Fact>
          <Fact label="🎟 connections here">{c.connections}</Fact>
          <Fact label="joined with a selfie here">{c.joined.length}</Fact>
        </dl>

        {c.joined.length > 0 && (
          <Section title="joined the club here">
            <People list={c.joined} base={base} av={av} hint={(p) => fmtDay(p.created_at)} />
          </Section>
        )}
        <Section title={`checked in · ${checked.length}`}>
          {checked.length ? <People list={checked} base={base} av={av} /> : <p className="meta">nobody yet</p>}
        </Section>
        <Section title={`going, not checked in · ${going.length}`}>
          {going.length ? <People list={going} base={base} av={av} /> : <p className="meta">nobody</p>}
        </Section>

        <Section title="admin log">
          {c.actions.length === 0 ? (
            <p className="meta">no actions yet · created {fmtDay(e.created_at)}</p>
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

function Top({ closeHref }: { closeHref: string }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between bg-paper/95 px-5 py-3 backdrop-blur">
      <span className="meta">event</span>
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

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-surface-sunk px-3 py-2">
      <dt className="meta">{label}</dt>
      <dd className="text-[20px] leading-7 font-bold">{children}</dd>
    </div>
  );
}

function People({ list, base, av, hint }: { list: Person[]; base: string; av: (p: Person) => string | null; hint?: (p: Person) => string }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {list.map((p) => (
        <li key={p.id}>
          <Link href={`${base}/members?m=${p.id}`} className="inline-flex max-w-full items-center gap-2 text-sm hover:underline">
            <Avatar name={p.name} size={24} src={av(p)} />
            <span className="truncate font-semibold">{p.name ?? "a ghost"}</span>
            {hint && <span className="meta shrink-0">{hint(p)}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
