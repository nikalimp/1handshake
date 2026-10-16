import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { buttonClass } from "@/components/button";
import { CancelEventButton, GoingButton, RegisterLink, ReviewButtons } from "@/components/event-controls";
import { EventCover, EventFacts } from "@/components/event-view";
import { Markdown } from "@/components/markdown";
import { CARD_FIELDS, type Card, requireMe } from "@/lib/data";
import { CARD_URL } from "@/lib/env";
import { EVENT_FIELDS, type EventRow, isOver } from "@/lib/event-format";
import { signedUrls } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(props: PageProps<"/events/[slug]">) {
  const { slug } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("title").eq("slug", slug).maybeSingle<{ title: string }>();
  return { title: data?.title ?? "event", robots: { index: false } };
}

type Person = { user_id: string; going_at: string | null; checked_in_at: string | null };

export default async function EventPage(props: PageProps<"/events/[slug]">) {
  const { slug } = await props.params;
  const me = await requireMe();
  const supabase = await createClient();
  const [{ data: ev }, { data: admin }] = await Promise.all([supabase.from("events").select(EVENT_FIELDS).eq("slug", slug).maybeSingle<EventRow>(), supabase.rpc("is_admin")]);
  if (!ev) notFound();

  const [{ data: rows }, { data: city }] = await Promise.all([
    supabase.from("event_people").select("user_id, going_at, checked_in_at").eq("event_id", ev.id).returns<Person[]>(),
    ev.city_id ? supabase.from("cities").select("name").eq("id", ev.city_id).maybeSingle<{ name: string }>() : Promise.resolve({ data: null }),
  ]);
  const people = rows ?? [];
  const ids = [...new Set([ev.host_id, ...people.map((p) => p.user_id)])];
  const { data: cards } = await supabase.from("profiles").select(CARD_FIELDS).in("id", ids).eq("status", "active").returns<Card[]>();
  const byId = new Map((cards ?? []).map((c) => [c.id, c]));
  const avatars = await signedUrls(supabase, "avatars", (cards ?? []).map((c) => c.avatar_path));
  const host = byId.get(ev.host_id);
  const here = people.filter((p) => p.checked_in_at && byId.has(p.user_id));
  const going = people.filter((p) => !p.checked_in_at && p.going_at && byId.has(p.user_id));
  const mine = people.find((p) => p.user_id === me.id);
  const isHost = ev.host_id === me.id;
  const canEdit = isHost || admin === true;
  const over = isOver(ev);
  const cancelled = Boolean(ev.cancelled_at);

  const faces = (list: Person[]) => (
    <ul className="flex flex-col divide-y divide-line">
      {list.map((p) => {
        const c = byId.get(p.user_id)!;
        return (
          <li key={p.user_id}>
            <Link href={c.id === me.id ? "/profile" : `/people/${c.handle}`} className="flex items-center gap-3 py-2.5">
              <Avatar name={c.name} size={40} src={c.avatar_path ? avatars.get(c.avatar_path) : undefined} />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{c.id === me.id ? "you" : c.name}</span>
                <span className="block truncate text-sm text-ink-muted">{c.role}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <article className="flex flex-col gap-5 pt-2">
      <Link href="/events" className="meta w-fit hover:text-ink">
        ← events
      </Link>
      <div className="overflow-hidden rounded-[var(--radius-lg)] shadow-[var(--shadow-card)]">
        <EventCover path={ev.cover_path} title={ev.title} />
      </div>

      {ev.review !== "approved" && (
        <div className="flex flex-col gap-3 rounded-[var(--radius-md)] bg-surface-sunk px-4 py-3 text-sm">
          <p>
            {ev.review === "pending"
              ? "⏳ waiting for approval. your connections already see it in the feed; the club calendar and check-in open once it's approved."
              : "this event wasn't approved. edit it and it goes back to review."}
          </p>
          {admin === true && ev.review === "pending" && <ReviewButtons eventId={ev.id} />}
        </div>
      )}
      {cancelled && <p className="rounded-[var(--radius-md)] bg-fire-soft px-4 py-3 text-sm font-semibold text-fire-ink">this event is cancelled</p>}

      <h1 className="text-[30px] leading-[34px] font-extrabold tracking-[-0.03em]">{ev.title}</h1>
      <EventFacts ev={ev} city={city?.name} />

      {!cancelled && !over && (
        <div className="flex flex-wrap gap-2">
          {mine?.checked_in_at ? (
            <span className="inline-flex h-12 items-center rounded-full bg-fire-soft px-5 font-semibold text-fire-ink">✓ checked in</span>
          ) : (
            <GoingButton eventId={ev.id} going={Boolean(mine?.going_at)} count={people.filter((p) => p.going_at || p.checked_in_at).length} />
          )}
          {ev.registration_url && <RegisterLink href={ev.registration_url} />}
        </div>
      )}
      {mine?.checked_in_at && here.length > 1 && (
        <Link href="/connect" className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] bg-fire px-5 py-4 font-semibold text-on-fire">
          <span>meet the {here.length - 1} other {here.length === 2 ? "person" : "people"} here</span>
          <span aria-hidden>→</span>
        </Link>
      )}

      {host && (
        <Link href={isHost ? "/profile" : `/people/${host.handle}`} className="flex items-center gap-3">
          <Avatar name={host.name} size={36} src={host.avatar_path ? avatars.get(host.avatar_path) : undefined} />
          <span className="text-sm">
            hosted by <b>{isHost ? "you" : host.name}</b>
          </span>
        </Link>
      )}

      {canEdit && (
        <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-dashed border-line-strong p-4" aria-label="for the host">
          <p className="font-semibold">for the host</p>
          <div className="flex flex-wrap gap-2">
            {ev.review === "approved" && !cancelled && (
              <Link href={`/events/${ev.slug}/qr`} className={buttonClass("primary", "sm")}>
                check-in qr
              </Link>
            )}
            <Link href={`/events/${ev.slug}/edit`} className={buttonClass("secondary", "sm")}>
              edit
            </Link>
            {ev.review === "approved" && (
              <a href={`${CARD_URL}/e/${ev.slug}`} target="_blank" rel="noopener" className={buttonClass("ghost", "sm")}>
                public page ↗
              </a>
            )}
          </div>
          <p className="meta">
            {ev.review === "approved"
              ? "show the qr at the entrance. it works from 3 hours before the start until 3 hours after the end. members who scan it see everyone who came. newcomers join with a selfie with a member, as usual."
              : "the check-in qr appears once the event is approved."}
          </p>
          {!cancelled && <CancelEventButton eventId={ev.id} slug={ev.slug} />}
        </section>
      )}

      {ev.body_md && (
        <section className="rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-card)]">
          <Markdown source={ev.body_md} />
        </section>
      )}

      {here.length > 0 && (
        <section className="flex flex-col gap-1" aria-label="here">
          <h2 className="px-0.5 text-[22px] leading-7 font-extrabold tracking-[-0.02em]">here · {here.length}</h2>
          {faces(here)}
        </section>
      )}
      {going.length > 0 && (
        <section className="flex flex-col gap-1" aria-label="going">
          <h2 className="px-0.5 text-[22px] leading-7 font-extrabold tracking-[-0.02em]">going · {going.length}</h2>
          {faces(going)}
        </section>
      )}
    </article>
  );
}
