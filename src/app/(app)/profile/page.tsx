import Link from "next/link";
import { buttonClass } from "@/components/button";
import { ProfileView } from "@/components/profile-view";
import { ScreenTitle } from "@/components/screen-title";
import { requireMe } from "@/lib/data";
import { loadProfile } from "@/lib/profile";

export const metadata = { title: "profile" };

export default async function ProfilePage() {
  const me = await requireMe();
  const data = me.handle ? await loadProfile(me.handle, me) : null;
  return (
    <>
      <ScreenTitle title="profile">
        <div className="flex gap-2">
          {me.handle && (
            <Link href={`/@${me.handle}`} className={buttonClass("ghost", "sm")}>
              public card
            </Link>
          )}
          <Link href="/profile/edit" className={buttonClass("primary", "sm")}>
            edit
          </Link>
        </div>
      </ScreenTitle>
      {data && <ProfileView data={data} me={me} />}
    </>
  );
}
