import "server-only";
import { CARD_FIELDS, type Card } from "@/lib/data";
import { signedUrls } from "@/lib/files";
import { OFFER_FIELDS, type Offer } from "@/lib/offers";
import { createClient } from "@/lib/supabase/server";

export type Person = Card & { cities: { name: string } | null };
export type WallItem = {
  kind: "handshake" | "post";
  id: string;
  at: string;
  author_id: string;
  other_id: string | null;
  body: string | null;
  selfie_path: string | null;
  fires: number;
  fired: boolean;
};

/** Everything the internal profile screen needs: the person, how I'm connected to them, their wall. */
export async function loadProfile(handle: string, me: Card) {
  const supabase = await createClient();
  const { data: person } = await supabase
    .from("profiles")
    .select(`${CARD_FIELDS}, cities(name)`)
    .eq("handle", handle.toLowerCase())
    .maybeSingle<Person>();
  if (!person) return null;

  const isMe = person.id === me.id;
  const [a, b] = [me.id, person.id].sort();
  const [{ data: link }, { data: wallRows }, { data: sphereRows }, { data: offerRows }, { data: countRows }] = await Promise.all([
    isMe
      ? Promise.resolve({ data: null })
      : supabase.from("connections").select("kind").eq("user_a", a).eq("user_b", b).maybeSingle<{ kind: "met" | "intro" }>(),
    supabase.rpc("wall", { p_profile: person.id }),
    supabase.from("profile_spheres").select("is_primary, spheres(name)").eq("profile_id", person.id).returns<{ is_primary: boolean; spheres: { name: string } | null }[]>(),
    supabase.from("offers").select(OFFER_FIELDS).eq("profile_id", person.id).order("created_at", { ascending: false }).returns<Offer[]>(),
    supabase.rpc("offer_counts", { p_profile: person.id }),
  ]);
  // Open offers first; others only see open ones.
  const offers = (offerRows ?? []).filter((o) => isMe || !o.closed_at).sort((a, b) => Number(Boolean(a.closed_at)) - Number(Boolean(b.closed_at)));
  const counts = new Map(((countRows ?? []) as { offer_id: string; interested: number }[]).map((c) => [c.offer_id, c.interested]));
  // Who's interested: my own choices, or — on my profile — everyone interested in my offers.
  const { data: interestRows } = offers.length
    ? await supabase.from("offer_interest").select("offer_id, profile_id").in("offer_id", offers.map((o) => o.id)).returns<{ offer_id: string; profile_id: string }[]>()
    : { data: [] as { offer_id: string; profile_id: string }[] };
  const mineInterest = new Set((interestRows ?? []).filter((r) => r.profile_id === me.id).map((r) => r.offer_id));
  const spheres = (sphereRows ?? [])
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
    .map((s) => s.spheres?.name)
    .filter((n): n is string => Boolean(n));
  const wall = ((wallRows ?? []) as WallItem[]).map((w) => ({ ...w, fires: Number(w.fires) }));

  const ids = [...new Set([...wall.flatMap((w) => [w.author_id, w.other_id]), ...(isMe ? (interestRows ?? []).map((r) => r.profile_id) : [])].filter((x): x is string => Boolean(x)))];
  const { data: others } = ids.length ? await supabase.from("profiles").select(CARD_FIELDS).in("id", ids).returns<Card[]>() : { data: [] as Card[] };
  const people = new Map<string, Card>([...(others ?? []), person, me].map((p) => [p.id, p]));

  const [avatars, selfies] = await Promise.all([
    signedUrls(supabase, "avatars", [...people.values()].map((p) => p.avatar_path)),
    signedUrls(supabase, "selfies", wall.map((w) => w.selfie_path)),
  ]);

  const interestedIn = (offerId: string) =>
    (interestRows ?? [])
      .filter((r) => r.offer_id === offerId && people.has(r.profile_id))
      .map((r) => {
        const p = people.get(r.profile_id)!;
        return { id: p.id, name: p.name, handle: p.handle, avatar: p.avatar_path ? (avatars.get(p.avatar_path) ?? null) : null };
      });
  const offerItems = offers.map((o) => ({ offer: o, count: counts.get(o.id) ?? 0, mine: mineInterest.has(o.id), interested: isMe ? interestedIn(o.id) : [] }));

  return { person, isMe, connection: link?.kind ?? null, wall, people, avatars, selfies, spheres, offers: offerItems };
}

export type LoadedProfile = NonNullable<Awaited<ReturnType<typeof loadProfile>>>;
