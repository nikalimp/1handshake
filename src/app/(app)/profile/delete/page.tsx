import { ScreenTitle } from "@/components/screen-title";
import { requireMe } from "@/lib/data";
import { DeleteForm } from "./delete-form";

export const metadata = { title: "delete account", robots: { index: false } };

export default async function DeletePage() {
  const me = await requireMe();
  return (
    <>
      <ScreenTitle title="delete account" />
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-card)]">
          <p className="font-semibold">what happens</p>
          <ul className="flex flex-col gap-2 text-[15px]">
            <li>👻 your card becomes a ghost: no name, photo, city or text. your public card and llms.txt go away.</li>
            <li>🗑 your wall, posts, fires, offers, links, photos and selfies are deleted; your events are cancelled.</li>
            <li>🔗 your connections stay as an anonymous dot in their graphs, so their intros don&apos;t break.</li>
            <li>🔑 your google sign-in is removed. to come back you&apos;d need a new invite.</li>
          </ul>
          <p className="text-sm text-ink-muted">this can&apos;t be undone.</p>
        </section>
        <a href="/profile/export" className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-dashed border-line-strong px-5 py-4">
          <span>
            <span className="block font-semibold">download your data first</span>
            <span className="block text-sm text-ink-muted">one json file with your card, connections, invites and posts</span>
          </span>
          <span aria-hidden>↓</span>
        </a>
        <DeleteForm handle={me.handle ?? ""} />
      </div>
    </>
  );
}
