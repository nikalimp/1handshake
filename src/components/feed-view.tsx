import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { buttonClass } from "@/components/button";
import { BackButton, RequestActions } from "@/components/feed-controls";
import { ReportHandshake } from "@/components/moderation";
import { PushCard } from "@/components/push-card";
import { ScreenTitle } from "@/components/screen-title";
import { FireButton } from "@/components/wall-controls";
import type { Card } from "@/lib/data";

export type Incoming = { id: string; from_id: string; created_at: string; fires: number; mutuals: string[] };
export type ToBack = { id: string; from_id: string; to_id: string; created_at: string; backed: boolean; fires: number };
export type Event = {
  kind: "handshake" | "intro" | "post";
  id: string;
  at: string;
  actor_id: string;
  subject_id: string;
  body: string | null;
  selfie_path: string | null;
  fires: number;
  fired: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = new Intl.DateTimeFormat("en", { day: "numeric", month: "short" });
const when = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return day.format(new Date(iso)).toLowerCase();
};
const first = (c?: Card | null) => (c?.name ?? "a member").split(" ")[0];
const list = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

function Name({ person, me }: { person?: Card | null; me: Card }) {
  if (person?.id === me.id) return <>you</>;
  if (!person?.handle) return <>{person?.name ?? "a member"}</>;
  return (
    <Link href={`/people/${person.handle}`} className="hover:underline">
      {person.name}
    </Link>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="px-0.5 text-[22px] leading-7 font-extrabold tracking-[-0.02em]">{title}</h2>
      {children}
    </section>
  );
}

export type FeedData = {
  me: Card;
  incoming: Incoming[];
  toBack: ToBack[];
  events: Event[];
  people: Map<string, Card>;
  avatars: Map<string, string>;
  selfies: Map<string, string>;
};

/** The feed screen: requests to answer, intros to back, and what happened around me. */
export function FeedView({ me, incoming, toBack, events, people, avatars, selfies }: FeedData) {
  const face = (id: string, size: number) => {
    const p = people.get(id);
    return <Avatar name={p?.name ?? null} size={size} src={p?.avatar_path ? avatars.get(p.avatar_path) : undefined} />;
  };

  return (
    <>
      <ScreenTitle title="feed" />
      <div className="flex flex-col gap-8">
        <PushCard />
        {incoming.length > 0 && (
          <Section title="want to meet you">
            {incoming.map((r) => {
              const from = people.get(r.from_id);
              const mutualNames = r.mutuals.map((m) => first(people.get(m)));
              return (
                <article key={r.id} className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-card)]">
                  <div className="flex items-center gap-3">
                    {face(r.from_id, 56)}
                    <div className="min-w-0">
                      <p className="text-lg leading-6 font-extrabold">
                        <Name person={from} me={me} />
                      </p>
                      <p className="text-sm text-ink-muted">{from?.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex">
                      {r.mutuals.slice(0, 4).map((m, i) => (
                        <span key={m} className={i ? "-ml-2" : ""}>
                          {face(m, 28)}
                        </span>
                      ))}
                    </span>
                    <span className="meta">
                      via {list(mutualNames)} · {r.fires > 0 ? `🔥 ${r.fires} backed` : "no 🔥 yet"}
                    </span>
                  </div>
                  <RequestActions requestId={r.id} firstName={first(from)} />
                </article>
              );
            })}
          </Section>
        )}

        {toBack.length > 0 && (
          <Section title="back an intro">
            {toBack.map((r) => (
              <article key={r.id} className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-card)]">
                <div className="flex items-center gap-2">
                  {face(r.from_id, 36)}
                  <span className="text-ink-muted">→</span>
                  {face(r.to_id, 36)}
                </div>
                <p>
                  <Name person={people.get(r.from_id)} me={me} /> wants to meet <Name person={people.get(r.to_id)} me={me} />. you know both — does this intro make sense?
                </p>
                <div className="flex items-center justify-between gap-3">
                  <span className="meta">{r.fires > 0 ? `🔥 ${r.fires} so far` : "be the first to back it"}</span>
                  <BackButton requestId={r.id} backed={r.backed} />
                </div>
              </article>
            ))}
          </Section>
        )}

        <Section title="around you">
          {events.map((e) => {
            const actor = people.get(e.actor_id);
            const subject = people.get(e.subject_id);
            if (e.kind === "handshake") {
              const selfie = e.selfie_path ? selfies.get(e.selfie_path) : null;
              return (
                <article key={`h-${e.id}`} className="overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]">
                  {selfie && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selfie} alt={`${actor?.name ?? "a member"} and ${subject?.name ?? "a member"} met in person`} className="aspect-square w-full object-cover" />
                  )}
                  <div className="flex flex-wrap items-center gap-3 p-4">
                    <span className="flex">
                      {face(e.actor_id, 36)}
                      <span className="-ml-2">{face(e.subject_id, 36)}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        🤝 <Name person={actor} me={me} /> &amp; <Name person={subject} me={me} /> met in person
                      </p>
                      <p className="meta">{when(e.at)}</p>
                    </div>
                    {selfie && me.id !== e.actor_id && me.id !== e.subject_id && UUID.test(e.id) && <ReportHandshake inviteId={e.id} />}
                  </div>
                </article>
              );
            }
            if (e.kind === "intro") {
              return (
                <article key={`i-${e.id}`} className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
                  <span className="flex">
                    {face(e.actor_id, 36)}
                    <span className="-ml-2">{face(e.subject_id, 36)}</span>
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">
                      🔗 <Name person={actor} me={me} /> &amp; <Name person={subject} me={me} /> connected through an intro
                    </p>
                    <p className="meta">{when(e.at)}</p>
                  </div>
                </article>
              );
            }
            const ownWall = e.actor_id === e.subject_id;
            return (
              <article key={`p-${e.id}`} className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
                <div className="flex items-center gap-3">
                  {face(e.actor_id, 36)}
                  <div className="min-w-0">
                    <p className="font-semibold">
                      <Name person={actor} me={me} />
                      {!ownWall && (
                        <span className="font-normal text-ink-muted">
                          {" "}
                          → <Name person={subject} me={me} />
                        </span>
                      )}
                    </p>
                    <p className="meta">{when(e.at)}</p>
                  </div>
                </div>
                <p className="whitespace-pre-line">{e.body}</p>
                <div>
                  <FireButton postId={e.id} fires={e.fires} fired={e.fired} />
                </div>
              </article>
            );
          })}
          {events.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <p className="text-ink-muted">quiet here for now. new handshakes and posts from your connections show up here.</p>
              <Link href="/invite" className={buttonClass("primary")}>
                + invite
              </Link>
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
