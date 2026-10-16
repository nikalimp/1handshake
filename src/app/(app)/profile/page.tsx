import Link from "next/link";
import { buttonClass } from "@/components/button";
import { ProfileView } from "@/components/profile-view";
import { ScreenTitle } from "@/components/screen-title";
import { ShareCard } from "@/components/share-card";
import { requireMe } from "@/lib/data";
import { loadProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "profile" };

export default async function ProfilePage() {
  const me = await requireMe();
  const supabase = await createClient();
  const [data, { count }] = await Promise.all([
    me.handle ? loadProfile(me.handle, me) : Promise.resolve(null),
    supabase.from("connections").select("user_a", { count: "exact", head: true }).or(`user_a.eq.${me.id},user_b.eq.${me.id}`),
  ]);
  return (
    <>
      <ScreenTitle title="profile">
        <div className="flex gap-2">
          {me.handle && <ShareCard handle={me.handle} name={me.name ?? "me"} />}
          <Link href="/profile/edit" className={buttonClass("primary", "sm")}>
            edit
          </Link>
        </div>
      </ScreenTitle>
      {data && (
        <ProfileView
          data={data}
          me={me}
          actions={
            <Link href="/profile/connections" className="flex flex-col items-end rounded-[var(--radius-md)] px-2 py-1 text-right hover:bg-surface-sunk">
              <span className="text-[22px] leading-7 font-extrabold">{count ?? 0}</span>
              <span className="meta">connections →</span>
            </Link>
          }
        />
      )}
    </>
  );
}
