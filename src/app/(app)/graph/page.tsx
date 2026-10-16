import { GraphView, type GraphNode } from "@/components/graph-view";
import { CARD_FIELDS, requireMe, type Card } from "@/lib/data";
import { signedUrls } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "graph" };

type Edge = { src: string; dst: string; kind: "met" | "intro" };

// Me in the centre, my connections around me, their networks further out (only where they keep
// "open to network" on — my_graph() enforces that in the database).
export default async function GraphPage() {
  const me = await requireMe();
  const supabase = await createClient();
  const { data: rows } = await supabase.rpc("my_graph");
  const edges = (rows ?? []) as Edge[];

  const ids = [...new Set([me.id, ...edges.flatMap((e) => [e.src, e.dst])])];
  const [{ data: cards }, { data: links }, { data: spheres }] = await Promise.all([
    supabase.from("profiles").select(`${CARD_FIELDS}, cities(name)`).in("id", ids).returns<(Card & { cities: { name: string } | null })[]>(),
    supabase.from("profile_spheres").select("profile_id, sphere_id").in("profile_id", ids),
    supabase.from("spheres").select("id, parent_id, name").order("name").returns<{ id: number; parent_id: number | null; name: string }[]>(),
  ]);
  const avatars = await signedUrls(supabase, "avatars", (cards ?? []).map((c) => c.avatar_path));

  const direct = new Set(edges.filter((e) => e.src === me.id).map((e) => e.dst));
  const sphereOf = new Map<string, number[]>();
  for (const l of links ?? []) sphereOf.set(l.profile_id, [...(sphereOf.get(l.profile_id) ?? []), l.sphere_id]);

  const nodes: GraphNode[] = (cards ?? []).map((c) => ({
    id: c.id,
    name: c.name ?? "👻",
    role: c.role ?? "",
    handle: c.handle,
    city: c.cities?.name ?? null,
    spheres: sphereOf.get(c.id) ?? [],
    avatar: c.avatar_path ? (avatars.get(c.avatar_path) ?? null) : null,
    degree: c.id === me.id ? 0 : direct.has(c.id) ? 1 : 2,
  }));

  return <GraphView meId={me.id} nodes={nodes} edges={edges} spheres={spheres ?? []} />;
}
