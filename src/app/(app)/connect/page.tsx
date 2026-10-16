import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { buttonClass } from "@/components/button";
import { MemberCard } from "@/components/member-card";
import { ScreenTitle } from "@/components/screen-title";
import { CARD_FIELDS, type Card } from "@/lib/data";
import { signedUrls } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "connect" };

type Outgoing = { id: string; to_id: string; created_at: string; fires: number; mutuals: string[] };

export default async function ConnectPage() {
  const supabase = await createClient();
  const [{ data: rows }, { data: outRows }] = await Promise.all([supabase.rpc("people_one_handshake_away"), supabase.rpc("outgoing_requests")]);
  const list = (rows ?? []) as { person: string; mutuals: string[] }[];
  const outgoing = ((outRows ?? []) as Outgoing[]).map((o) => ({ ...o, fires: Number(o.fires) }));

  const ids = [...new Set([...list.flatMap((r) => [r.person, ...r.mutuals]), ...outgoing.map((o) => o.to_id)])];
  const { data: cards } = ids.length ? await supabase.from("profiles").select(CARD_FIELDS).in("id", ids).returns<Card[]>() : { data: [] as Card[] };
  const byId = new Map((cards ?? []).map((c) => [c.id, c]));
  const avatars = await signedUrls(supabase, "avatars", (cards ?? []).map((c) => c.avatar_path));

  return (
    <>
      <ScreenTitle title="connect">
        <Link href="/invite" className={buttonClass("primary", "sm")}>
          + invite
        </Link>
      </ScreenTitle>
      <p className="meta -mt-2 mb-4 px-0.5">{list.length} people one handshake away · take your time</p>
      <div className="flex flex-col gap-4">
        {list.map((r) => {
          const person = byId.get(r.person);
          if (!person) return null;
          return <MemberCard key={r.person} person={person} mutuals={r.mutuals.map((m) => byId.get(m)).filter((m): m is Card => Boolean(m))} avatars={avatars} />;
        })}
        {list.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <h2 className="text-[22px] leading-7 font-extrabold">nobody one handshake away yet</h2>
            <p className="text-ink-muted">new people show up when you and your connections make new handshakes.</p>
            <Link href="/invite" className={buttonClass("primary")}>
              + invite
            </Link>
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
                  <p className="meta">
                    🔥 {o.fires} of {o.mutuals.length} mutuals backed you
                  </p>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
