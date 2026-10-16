import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { buttonClass } from "@/components/button";
import { ScreenTitle } from "@/components/screen-title";
import { requireMe } from "@/lib/data";

export const metadata = { title: "profile" };

export default async function ProfilePage() {
  const me = await requireMe();
  return (
    <>
      <ScreenTitle title="profile">
        {me.handle && (
          <Link href={`/@${me.handle}`} className={buttonClass("ghost", "sm")}>
            view public card
          </Link>
        )}
      </ScreenTitle>
      <article className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-line bg-surface p-6">
        <Avatar name={me.name} size={84} />
        <h2 className="text-[26px] leading-[30px] font-extrabold tracking-[-0.02em] lowercase">
          {me.name} <span className="font-semibold text-ink-muted">— {me.role}</span>
        </h2>
        <p className="whitespace-pre-line">{me.bio_md}</p>
      </article>
      <form action="/auth/signout" method="post" className="mt-8">
        <button className={buttonClass("secondary", "sm")}>sign out</button>
      </form>
      <p className="meta mt-8 text-center">open source · v0.1.0</p>
    </>
  );
}
