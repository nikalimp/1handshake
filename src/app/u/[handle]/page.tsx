import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { buttonClass } from "@/components/button";
import { Logo } from "@/components/logo";
import { Markdown, plainText } from "@/components/markdown";
import { SocialLinks } from "@/components/social-links";
import { cardToMarkdown, getCardByHandle } from "@/lib/cards";
import { getMe } from "@/lib/data";
import { APP_URL, CARD_HOST, CARD_URL } from "@/lib/env";
import { signedUrls } from "@/lib/files";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(props: PageProps<"/u/[handle]">): Promise<Metadata> {
  const { handle } = await props.params;
  const card = await getCardByHandle(handle);
  if (!card || card.status !== "active") return { title: "member", robots: { index: false } };
  const title = `${card.name} — ${card.role}`;
  return {
    title,
    description: plainText(card.bio_md).slice(0, 160),
    // Absolute: this page is also served through the site's proxy at 1handshake.com/@handle.
    alternates: { canonical: `${CARD_URL}/@${card.handle}`, types: { "text/markdown": `${CARD_URL}/@${card.handle}/llms.txt` } },
    openGraph: { title, description: plainText(card.bio_md).slice(0, 160), type: "profile", url: `${CARD_URL}/@${card.handle}` },
    icons: { icon: `${APP_URL}/1h-app-icon.svg`, apple: `${APP_URL}/apple-icon.png` },
  };
}

export default async function VisitCard(props: PageProps<"/u/[handle]">) {
  const { handle } = await props.params;
  const card = await getCardByHandle(handle);
  if (!card) notFound();

  const supabase = await createClient();
  const viewer = await getMe();
  const { data: countRows } = await supabase.rpc("needs_count", { p_profile: card.id });
  const counts = ((countRows ?? [])[0] as { needs: number; cans: number } | undefined) ?? { needs: 0, cans: 0 };

  if (card.status === "ghost") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <span className="grid h-[84px] w-[84px] place-items-center rounded-full border-[1.5px] border-dashed border-line-strong text-3xl">👻</span>
        <h1 className="text-2xl font-extrabold">this member left the club</h1>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8">
      {/* Every link here is absolute: the card is also served at 1handshake.com through the site's proxy. */}
      <a href={`${CARD_URL}/`} aria-label="what is 1handshake" className="text-ink">
        <Logo size={28} />
      </a>
      <article className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-line bg-surface p-6">
        <Avatar name={card.name} size={84} src={(await signedUrls(createAdminClient(), "avatars", [card.avatar_path])).get(card.avatar_path ?? "")} />
        <h1 className="text-[28px] leading-8 font-extrabold tracking-[-0.02em]">
          {card.name} <span className="font-semibold text-ink-muted">— {card.role}</span>
        </h1>
        {card.cities?.name && <span className="meta">{card.cities.name}</span>}
        {card.bio_md && <Markdown source={card.bio_md} />}
        <SocialLinks links={card.links} />
        {(counts.needs > 0 || counts.cans > 0) && (
          <div className="relative overflow-hidden rounded-[var(--radius-md)] bg-surface-sunk p-4" aria-label="i need and i can — visible to members">
            <div className="flex flex-col gap-2 blur-[5px] select-none" aria-hidden>
              {counts.needs > 0 && <p>i need: someone who knows this space well, and an intro or two.</p>}
              {counts.cans > 0 && <p>i can: help with what i know best, review your work, share contacts.</p>}
            </div>
            <span className="absolute inset-0 grid place-items-center px-4 text-center text-sm font-semibold">
              {[counts.needs > 0 && `needs ${counts.needs}`, counts.cans > 0 && `can help with ${counts.cans}`].filter(Boolean).join(" · ")} · 🤝 members see it
            </span>
          </div>
        )}
        <pre className="rounded-[var(--radius-sm)] border border-dashed border-line-strong p-3 font-mono text-xs leading-[18px] whitespace-pre-wrap text-ink-muted">{cardToMarkdown(card)}</pre>
        {viewer ? (
          <a href={viewer.id === card.id ? `${APP_URL}/profile` : `${APP_URL}/people/${card.handle}`} className={buttonClass("primary")}>
            {viewer.id === card.id ? "open my profile" : "open in the club"}
          </a>
        ) : (
          <a href={`${APP_URL}/`} className={buttonClass("primary")}>
            how to join
          </a>
        )}
      </article>
      <p className="meta text-center">
        {CARD_HOST}/@{card.handle} · <a href={`${CARD_URL}/@${card.handle}/llms.txt`}>llms.txt</a> · <a href={`${CARD_URL}/`}>what is 1handshake</a>
      </p>
    </main>
  );
}
