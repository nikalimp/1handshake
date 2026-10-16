import { ScreenTitle } from "@/components/screen-title";
import { CARD_FIELDS, type Card, requireMe } from "@/lib/data";
import { signedUrls } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";
import { ConnectionsList } from "./connections-list";

export const metadata = { title: "connections" };

type Row = { user_a: string; user_b: string; kind: "met" | "intro"; created_at: string };

// Everyone I'm connected with: 🤝 met in person or 🔗 through an intro. Searchable.
export default async function ConnectionsPage() {
  const me = await requireMe();
  const supabase = await createClient();
  const { data: rows } = await supabase.from("connections").select("user_a, user_b, kind, created_at").or(`user_a.eq.${me.id},user_b.eq.${me.id}`).order("created_at", { ascending: false }).returns<Row[]>();
  const other = (r: Row) => (r.user_a === me.id ? r.user_b : r.user_a);
  const ids = (rows ?? []).map(other);
  const { data: cards } = ids.length
    ? await supabase.from("profiles").select(`${CARD_FIELDS}, cities(name)`).in("id", ids).returns<(Card & { cities: { name: string } | null })[]>()
    : { data: [] as (Card & { cities: { name: string } | null })[] };
  const byId = new Map((cards ?? []).map((c) => [c.id, c]));
  const avatars = await signedUrls(supabase, "avatars", (cards ?? []).map((c) => c.avatar_path));

  const people = (rows ?? []).map((r) => {
    const c = byId.get(other(r));
    return {
      id: other(r),
      name: c?.name ?? "👻",
      role: c?.role ?? (c?.status === "ghost" ? "left the club" : ""),
      handle: c?.handle ?? null,
      city: c?.cities?.name ?? null,
      avatar: c?.avatar_path ? (avatars.get(c.avatar_path) ?? null) : null,
      kind: r.kind,
      since: r.created_at,
    };
  });

  return (
    <>
      <ScreenTitle title="connections" />
      <ConnectionsList people={people} />
    </>
  );
}
