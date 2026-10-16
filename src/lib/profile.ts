import "server-only";
import { CARD_FIELDS, type Card } from "@/lib/data";
import { signedUrls } from "@/lib/files";
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
  const [{ data: link }, { data: wallRows }] = await Promise.all([
    isMe
      ? Promise.resolve({ data: null })
      : supabase.from("connections").select("kind").eq("user_a", a).eq("user_b", b).maybeSingle<{ kind: "met" | "intro" }>(),
    supabase.rpc("wall", { p_profile: person.id }),
  ]);
  const wall = ((wallRows ?? []) as WallItem[]).map((w) => ({ ...w, fires: Number(w.fires) }));

  const ids = [...new Set(wall.flatMap((w) => [w.author_id, w.other_id]).filter((x): x is string => Boolean(x)))];
  const { data: others } = ids.length ? await supabase.from("profiles").select(CARD_FIELDS).in("id", ids).returns<Card[]>() : { data: [] as Card[] };
  const people = new Map<string, Card>([...(others ?? []), person, me].map((p) => [p.id, p]));

  const [avatars, selfies] = await Promise.all([
    signedUrls(supabase, "avatars", [...people.values()].map((p) => p.avatar_path)),
    signedUrls(supabase, "selfies", wall.map((w) => w.selfie_path)),
  ]);

  return { person, isMe, connection: link?.kind ?? null, wall, people, avatars, selfies };
}

export type LoadedProfile = NonNullable<Awaited<ReturnType<typeof loadProfile>>>;
