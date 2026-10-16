import { FeedView, type Event, type Incoming, type ToBack } from "@/components/feed-view";
import { CARD_FIELDS, requireMe, type Card } from "@/lib/data";
import { signedUrls } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "feed" };

export default async function FeedPage() {
  const me = await requireMe();
  const supabase = await createClient();
  const [{ data: inc }, { data: back }, { data: ev }] = await Promise.all([
    supabase.rpc("incoming_requests"),
    supabase.rpc("requests_to_back"),
    supabase.rpc("feed", { p_limit: 60 }),
  ]);
  const incoming = ((inc ?? []) as Incoming[]).map((r) => ({ ...r, fires: Number(r.fires), mutuals: r.mutuals.filter(Boolean) }));
  const toBack = ((back ?? []) as ToBack[]).map((r) => ({ ...r, fires: Number(r.fires) }));
  const events = ((ev ?? []) as Event[]).map((e) => ({ ...e, fires: Number(e.fires) }));

  const ids = [
    ...new Set([
      ...incoming.flatMap((r) => [r.from_id, ...r.mutuals]),
      ...toBack.flatMap((r) => [r.from_id, r.to_id]),
      ...events.flatMap((e) => [e.actor_id, e.subject_id]),
    ]),
  ].filter(Boolean);
  const { data: cards } = ids.length ? await supabase.from("profiles").select(CARD_FIELDS).in("id", ids).returns<Card[]>() : { data: [] as Card[] };
  const people = new Map<string, Card>([...(cards ?? []), me].map((c) => [c.id, c]));
  const [avatars, selfies] = await Promise.all([
    signedUrls(supabase, "avatars", [...people.values()].map((p) => p.avatar_path)),
    signedUrls(supabase, "selfies", events.map((e) => e.selfie_path)),
  ]);
  return <FeedView me={me} incoming={incoming} toBack={toBack} events={events} people={people} avatars={avatars} selfies={selfies} />;
}
