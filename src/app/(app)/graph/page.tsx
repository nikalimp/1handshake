import { GraphView, type GraphEdge, type GraphNode } from "@/components/graph-view";
import { CARD_FIELDS, requireMe, type Card } from "@/lib/data";
import { coverUrl, formatWhen } from "@/lib/event-format";
import { signedUrls } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "graph" };

type Edge = { src: string; dst: string; kind: "met" | "intro" };
type Attended = { event_id: string; user_id: string };
type Ev = { id: string; slug: string; title: string; cover_path: string | null; starts_at: string; ends_at: string | null; timezone: string; city_id: number | null; cities: { name: string } | null };

// Me in the centre, my connections around me, their networks further out (only where they keep
// "open to network" on — my_graph() enforces that in the database). Events where people of my graph
// checked in are nodes too, with their cover as the picture and a line to everyone of mine who came.
export default async function GraphPage() {
  const me = await requireMe();
  const supabase = await createClient();
  const { data: rows } = await supabase.rpc("my_graph");
  const edges = (rows ?? []) as Edge[];

  const ids = [...new Set([me.id, ...edges.flatMap((e) => [e.src, e.dst])])];
  const [{ data: cards }, { data: links }, { data: spheres }, { data: attended }] = await Promise.all([
    supabase.from("profiles").select(`${CARD_FIELDS}, cities(name)`).in("id", ids).returns<(Card & { cities: { name: string } | null })[]>(),
    supabase.from("profile_spheres").select("profile_id, sphere_id").in("profile_id", ids),
    supabase.from("spheres").select("id, parent_id, name").order("name").returns<{ id: number; parent_id: number | null; name: string }[]>(),
    supabase.from("event_people").select("event_id, user_id").in("user_id", ids).not("checked_in_at", "is", null).returns<Attended[]>(),
  ]);
  const eventIds = [...new Set((attended ?? []).map((a) => a.event_id))];
  const [avatars, { data: events }] = await Promise.all([
    signedUrls(supabase, "avatars", (cards ?? []).map((c) => c.avatar_path)),
    eventIds.length
      ? supabase.from("events").select("id, slug, title, cover_path, starts_at, ends_at, timezone, city_id, cities(name)").in("id", eventIds).is("cancelled_at", null).returns<Ev[]>()
      : Promise.resolve({ data: [] as Ev[] }),
  ]);

  const direct = new Set(edges.filter((e) => e.src === me.id).map((e) => e.dst));
  const sphereOf = new Map<string, number[]>();
  for (const l of links ?? []) sphereOf.set(l.profile_id, [...(sphereOf.get(l.profile_id) ?? []), l.sphere_id]);

  const nodes: GraphNode[] = (cards ?? []).map((c) => ({
    id: c.id,
    kind: "person",
    name: c.name ?? "👻",
    role: c.role ?? "",
    href: c.id === me.id ? "/profile" : c.handle ? `/people/${c.handle}` : null,
    city: c.cities?.name ?? null,
    spheres: sphereOf.get(c.id) ?? [],
    avatar: c.avatar_path ? (avatars.get(c.avatar_path) ?? null) : null,
    degree: c.id === me.id ? 0 : direct.has(c.id) ? 1 : 2,
  }));

  // Events: next to me when I was there, otherwise out with the people who were.
  const graphEdges: GraphEdge[] = [...edges];
  for (const ev of events ?? []) {
    const who = (attended ?? []).filter((a) => a.event_id === ev.id).map((a) => a.user_id);
    const id = `event:${ev.id}`;
    nodes.push({
      id,
      kind: "event",
      name: ev.title,
      role: formatWhen(ev),
      href: `/events/${ev.slug}`,
      city: ev.cities?.name ?? null,
      spheres: [],
      avatar: coverUrl(ev.cover_path),
      degree: who.includes(me.id) ? 1 : 2,
      count: who.length,
    });
    for (const u of who) graphEdges.push({ src: u, dst: id, kind: "event" });
  }

  return <GraphView meId={me.id} nodes={nodes} edges={graphEdges} spheres={spheres ?? []} />;
}
