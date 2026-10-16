import Link from "next/link";
import { buttonClass } from "@/components/button";
import type { City } from "@/components/city-picker";
import { PushCard } from "@/components/push-card";
import { ThemeSwitch } from "@/components/theme-switch";
import { requireMe } from "@/lib/data";
import { signedUrls } from "@/lib/files";
import { guessCity } from "@/lib/geo";
import { cleanLinks, LINK_KINDS, linkLabel } from "@/lib/links";
import { createClient } from "@/lib/supabase/server";
import { ProfileEditor } from "./profile-editor";

export const metadata = { title: "edit profile" };

export default async function EditProfilePage() {
  const me = await requireMe();
  const supabase = await createClient();
  const [{ data: city }, { data: birth }, avatars, { data: spheres }, { data: mine }, { data: admin }, { data: needs }] = await Promise.all([
    me.city_id ? supabase.from("cities").select("id, name, country").eq("id", me.city_id).maybeSingle<City>() : Promise.resolve({ data: null }),
    supabase.rpc("my_birth_date"),
    signedUrls(supabase, "avatars", [me.avatar_path]),
    supabase.from("spheres").select("id, parent_id, name").order("id").returns<{ id: number; parent_id: number | null; name: string }[]>(),
    supabase.from("profile_spheres").select("sphere_id, is_primary").eq("profile_id", me.id).returns<{ sphere_id: number; is_primary: boolean }[]>(),
    supabase.rpc("is_admin"),
    supabase.from("needs_offers").select("kind, body").eq("profile_id", me.id).order("created_at").returns<{ kind: "need" | "can"; body: string }[]>(),
  ]);
  const links = cleanLinks(me.links);
  const guess = city ? null : await guessCity(supabase);
  return (
    <>
      <ProfileEditor
        me={{
          id: me.id,
          name: me.name ?? "",
          role: me.role ?? "",
          handle: me.handle ?? "",
          bio_md: me.bio_md,
          city: city ?? guess,
          birth_date: (birth as string | null) ?? "",
          avatar_path: me.avatar_path,
          avatar_url: me.avatar_path ? (avatars.get(me.avatar_path) ?? null) : null,
          open_to_hiring: me.open_to_hiring,
          open_to_network: me.open_to_network,
          links: Object.fromEntries(LINK_KINDS.filter((k) => links[k.key]).map((k) => [k.key, k.key === "linkedin" ? links[k.key]!.replace(/^https:\/\/(www\.)?/, "") : linkLabel(k.key, links[k.key]!)])),
          needs: (needs ?? []).filter((n) => n.kind === "need").map((n) => n.body),
          cans: (needs ?? []).filter((n) => n.kind === "can").map((n) => n.body),
          spheres: (mine ?? []).sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).map((s) => s.sphere_id),
        }}
        spheres={spheres ?? []}
      />
      <section className="mt-5 flex flex-col divide-y divide-line rounded-[var(--radius-lg)] bg-surface px-5 py-2 shadow-[var(--shadow-card)]" aria-label="this device">
        <PushCard variant="row" />
        <ThemeSwitch />
      </section>
      <div className="mt-10 flex flex-col items-center gap-3 border-t border-line pt-6">
        {admin === true && (
          <Link href="/admin" className={buttonClass("ghost", "sm")}>
            moderation
          </Link>
        )}
        <div className="flex gap-4">
          <a href="/profile/export" className="meta hover:text-ink">
            download my data
          </a>
          <Link href="/profile/delete" className="meta hover:text-ink">
            delete account
          </Link>
        </div>
        <form action="/auth/signout" method="post">
          <button className={buttonClass("secondary", "sm")}>sign out</button>
        </form>
        <p className="meta">open source · v0.1.0</p>
      </div>
    </>
  );
}
