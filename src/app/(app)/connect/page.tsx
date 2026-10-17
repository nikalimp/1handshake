import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { buttonClass } from "@/components/button";
import { MemberCard } from "@/components/member-card";
import { ScreenTitle } from "@/components/screen-title";
import { CARD_FIELDS, type Card, requireMe } from "@/lib/data";
import { MAIN_URL } from "@/lib/env";
import { coverUrl } from "@/lib/event-format";
import { signedUrls } from "@/lib/files";
import { OFFER_FIELDS, type Offer } from "@/lib/offers";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "connect" };

type Outgoing = { id: string; to_id: string; created_at: string; fires: number; mutuals: string[]; event_id: string | null };
type FromEvent = { person: string; event_id: string; at: string };

export default async function ConnectPage() {
  await requireMe();
  const supabase = await createClient();
  const [{ data: rows }, { data: outRows }, { data: evRows }] = await Promise.all([
    supabase.rpc("people_one_handshake_away"),
    supabase.rpc("outgoing_requests"),
    supabase.rpc("people_from_events"),
  ]);
  // People from events I checked in at come first and connect directly; they're not repeated below.
  const fromEvents = ((evRows ?? []) as FromEvent[]).sort((a, b) => b.at.localeCompare(a.at));
  const atEvent = new Set(fromEvents.map((r) => r.person));
  const list = ((rows ?? []) as { person: string; mutuals: string[] }[]).filter((r) => !atEvent.has(r.person));
  const outgoing = ((outRows ?? []) as Outgoing[]).map((o) => ({ ...o, fires: Number(o.fires) }));
  const eventIds = [...new Set([...fromEvents.map((r) => r.event_id), ...outgoing.map((o) => o.event_id).filter((e): e is string => Boolean(e))])];
  const { data: evs } = eventIds.length ? await supabase.from("events").select("id, title, cover_path").in("id", eventIds).returns<{ id: string; title: string; cover_path: string | null }[]>() : { data: [] };
  const eventsById = new Map((evs ?? []).map((e) => [e.id, { id: e.id, title: e.title, cover: coverUrl(e.cover_path) }]));

  const ids = [...new Set([...list.flatMap((r) => [r.person, ...r.mutuals]), ...outgoing.map((o) => o.to_id), ...fromEvents.map((r) => r.person)])];
  const { data: cards } = ids.length ? await supabase.from("profiles").select(CARD_FIELDS).in("id", ids).returns<Card[]>() : { data: [] as Card[] };
  const byId = new Map((cards ?? []).map((c) => [c.id, c]));
  const [avatars, { data: offerRows }] = await Promise.all([
    signedUrls(supabase, "avatars", (cards ?? []).map((c) => c.avatar_path)),
    supabase.from("offers").select(OFFER_FIELDS).in("profile_id", [...list.map((r) => r.person), ...fromEvents.map((r) => r.person)]).is("closed_at", null).order("created_at", { ascending: false }).returns<Offer[]>(),
  ]);
  const offersOf = (id: string) => (offerRows ?? []).filter((o) => o.profile_id === id);
  // People with open offers first, the rest keep their order.
  const ordered = [...list].sort((a, b) => Number(offersOf(b.person).length > 0) - Number(offersOf(a.person).length > 0));

  return (
    <>
      <ScreenTitle title="connect">
        <Link href="/invite" className={buttonClass("primary", "sm")}>
          + invite
        </Link>
      </ScreenTitle>
      <p className="meta -mt-2 mb-4 px-0.5">
        {fromEvents.length > 0 && `${fromEvents.length} from events · `}
        {list.length} people one handshake away
        {" · take your time"}
      </p>
      <div className="flex flex-col gap-4">
        {fromEvents.map((r) => {
          const person = byId.get(r.person);
          const event = eventsById.get(r.event_id);
          if (!person || !event) return null;
          return <MemberCard key={r.person} person={person} mutuals={[]} avatars={avatars} offers={offersOf(r.person)} event={event} />;
        })}
        {ordered.map((r) => {
          const person = byId.get(r.person);
          if (!person) return null;
          return <MemberCard key={r.person} person={person} mutuals={r.mutuals.map((m) => byId.get(m)).filter((m): m is Card => Boolean(m))} avatars={avatars} offers={offersOf(r.person)} />;
        })}
        {list.length === 0 && fromEvents.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <h2 className="text-[22px] leading-7 font-extrabold">nobody one handshake away yet</h2>
            <p className="text-ink-muted">new people show up when you and your connections make new handshakes — or when you check in at an event.</p>
            <div className="flex gap-2">
              <Link href="/invite" className={buttonClass("primary")}>
                + invite
              </Link>
              <a href={`${MAIN_URL}/events`} target="_blank" rel="noopener" className={buttonClass("secondary")}>
                events ↗
              </a>
            </div>
          </div>
        )}
      </div>

      {outgoing.length > 0 && (
        <section className="mt-8 flex flex-col gap-3" aria-label="waiting for an answer">
          <h2 className="px-0.5 text-[22px] leading-7 font-extrabold tracking-[-0.02em]">waiting for an answer</h2>
          {outgoing.map((o) => {
            const p = byId.get(o.to_id);
            return (
              <div key={o.id} className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
                <Avatar name={p?.name ?? null} size={44} src={p?.avatar_path ? avatars.get(p.avatar_path) : undefined} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p?.handle ? <Link href={`/people/${p.handle}`}>{p.name}</Link> : (p?.name ?? "a member")}</p>
                  <p className="meta">{o.event_id ? `🎟 from ${eventsById.get(o.event_id)?.title ?? "an event"}` : `🔥 ${o.fires} of ${o.mutuals.length} mutuals backed you`}</p>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
