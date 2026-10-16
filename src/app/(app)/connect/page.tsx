import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { buttonClass } from "@/components/button";
import { MemberCard } from "@/components/member-card";
import { ScreenTitle } from "@/components/screen-title";
import { CARD_FIELDS, type Card, requireMe } from "@/lib/data";
import { coverUrl } from "@/lib/event-format";
import { signedUrls } from "@/lib/files";
import { findMatches, type Side } from "@/lib/match";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "connect" };

type Outgoing = { id: string; to_id: string; created_at: string; fires: number; mutuals: string[]; event_id: string | null };
type FromEvent = { person: string; event_id: string; at: string };

export default async function ConnectPage() {
  const me = await requireMe();
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
  const [avatars, { data: needRows }] = await Promise.all([
    signedUrls(supabase, "avatars", (cards ?? []).map((c) => c.avatar_path)),
    supabase.from("needs_offers").select("profile_id, kind, body").in("profile_id", [me.id, ...list.map((r) => r.person), ...fromEvents.map((r) => r.person)]).order("created_at").returns<{ profile_id: string; kind: "need" | "can"; body: string }[]>(),
  ]);
  const side = (id: string): Side => ({
    needs: (needRows ?? []).filter((n) => n.profile_id === id && n.kind === "need").map((n) => n.body),
    cans: (needRows ?? []).filter((n) => n.profile_id === id && n.kind === "can").map((n) => n.body),
  });
  const mine = side(me.id);
  const matches = await findMatches(
    supabase,
    me.id,
    mine,
    [...fromEvents.map((r) => r.person), ...list.map((r) => r.person)].map((id) => ({ id, role: byId.get(id)?.role ?? "", ...side(id) })),
  );
  // Matches first, the rest keep their order.
  const ordered = [...list].sort((a, b) => Number(Boolean(matches[b.person])) - Number(Boolean(matches[a.person])));

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
        {Object.keys(matches).length > 0 ? ` · ${Object.keys(matches).length} match` : " · take your time"}
      </p>
      {list.length + fromEvents.length > 0 && !mine.needs.length && !mine.cans.length && (
        <Link href="/profile/edit" className="mb-4 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-dashed border-line-strong px-5 py-4">
          <span>
            <span className="block font-semibold">get matches</span>
            <span className="block text-sm text-ink-muted">add what you need and what you can — people who fit show up first</span>
          </span>
          <span aria-hidden>→</span>
        </Link>
      )}
      <div className="flex flex-col gap-4">
        {fromEvents.map((r) => {
          const person = byId.get(r.person);
          const event = eventsById.get(r.event_id);
          if (!person || !event) return null;
          return <MemberCard key={r.person} person={person} mutuals={[]} avatars={avatars} match={matches[r.person]} side={side(r.person)} event={event} />;
        })}
        {ordered.map((r) => {
          const person = byId.get(r.person);
          if (!person) return null;
          return <MemberCard key={r.person} person={person} mutuals={r.mutuals.map((m) => byId.get(m)).filter((m): m is Card => Boolean(m))} avatars={avatars} match={matches[r.person]} side={side(r.person)} />;
        })}
        {list.length === 0 && fromEvents.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <h2 className="text-[22px] leading-7 font-extrabold">nobody one handshake away yet</h2>
            <p className="text-ink-muted">new people show up when you and your connections make new handshakes — or when you check in at an event.</p>
            <div className="flex gap-2">
              <Link href="/invite" className={buttonClass("primary")}>
                + invite
              </Link>
              <Link href="/events" className={buttonClass("secondary")}>
                events
              </Link>
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
