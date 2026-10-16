import { notFound, redirect } from "next/navigation";
import { RemoveConnection } from "@/components/moderation";
import { ProfileView } from "@/components/profile-view";
import { requireMe } from "@/lib/data";
import { loadProfile } from "@/lib/profile";

export const metadata = { title: "profile", robots: { index: false } };

// A member's profile inside the club: card, how we're connected, the wall.
// The public, indexable version of the same card lives at /@handle.
export default async function PersonPage(props: PageProps<"/people/[handle]">) {
  const { handle } = await props.params;
  const me = await requireMe();
  if (me.handle && handle.toLowerCase() === me.handle) redirect("/profile");
  const data = await loadProfile(handle, me);
  if (!data) notFound();
  return (
    <div className="flex flex-col gap-8 pt-6">
      <ProfileView data={data} me={me} />
      {data.connection && (
        <div className="flex justify-center">
          <RemoveConnection otherId={data.person.id} name={(data.person.name ?? "them").split(" ")[0]} />
        </div>
      )}
    </div>
  );
}
