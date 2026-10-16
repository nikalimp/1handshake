import Link from "next/link";
import { buttonClass } from "@/components/button";
import { MemberCard } from "@/components/member-card";
import { ScreenTitle } from "@/components/screen-title";
import { CARD_FIELDS, type Card } from "@/lib/data";
import { signedUrls } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "connect" };

export default async function ConnectPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase.rpc("people_one_handshake_away");
  const list = (rows ?? []) as { person: string; mutuals: string[] }[];
  const ids = [...new Set(list.flatMap((r) => [r.person, ...r.mutuals]))];
  const { data: cards } = ids.length
    ? await supabase.from("profiles").select(CARD_FIELDS).in("id", ids).returns<Card[]>()
    : { data: [] as Card[] };
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
            <Link href="/invite" className={buttonClass("primary")}>+ invite</Link>
          </div>
        )}
      </div>
    </>
  );
}
