import { requireMe } from "@/lib/data";
import { signedUrls } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";
import { ProfileEditor } from "./profile-editor";

export const metadata = { title: "edit profile" };

export default async function EditProfilePage() {
  const me = await requireMe();
  const supabase = await createClient();
  const [{ data: cities }, { data: birth }, avatars, { data: spheres }, { data: mine }] = await Promise.all([
    supabase.from("cities").select("id, name").order("name").returns<{ id: number; name: string }[]>(),
    supabase.rpc("my_birth_date"),
    signedUrls(supabase, "avatars", [me.avatar_path]),
    supabase.from("spheres").select("id, parent_id, name").order("id").returns<{ id: number; parent_id: number | null; name: string }[]>(),
    supabase.from("profile_spheres").select("sphere_id, is_primary").eq("profile_id", me.id).returns<{ sphere_id: number; is_primary: boolean }[]>(),
  ]);
  return (
    <ProfileEditor
      me={{
        id: me.id,
        name: me.name ?? "",
        role: me.role ?? "",
        handle: me.handle ?? "",
        bio_md: me.bio_md,
        city_id: me.city_id,
        birth_date: (birth as string | null) ?? "",
        avatar_path: me.avatar_path,
        avatar_url: me.avatar_path ? (avatars.get(me.avatar_path) ?? null) : null,
        open_to_hiring: me.open_to_hiring,
        open_to_network: me.open_to_network,
        spheres: (mine ?? []).sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).map((s) => s.sphere_id),
      }}
      cities={cities ?? []}
      spheres={spheres ?? []}
    />
  );
}
