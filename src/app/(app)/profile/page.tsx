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
        {me.handle && (
          <Link href={`/@${me.handle}`} className={buttonClass("ghost", "sm")}>
            public card
          </Link>
        )}
      </ScreenTitle>
      {data && <ProfileView data={data} me={me} />}
      <form action="/auth/signout" method="post" className="mt-8">
        <button className={buttonClass("secondary", "sm")}>sign out</button>
      </form>
      <p className="meta mt-8 text-center">open source · v0.1.0</p>
    </>
  );
}
