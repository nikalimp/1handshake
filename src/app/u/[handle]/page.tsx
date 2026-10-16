import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { buttonClass } from "@/components/button";
import { Logo } from "@/components/logo";
import { cardToMarkdown, getCardByHandle } from "@/lib/cards";

export async function generateMetadata(props: PageProps<"/u/[handle]">): Promise<Metadata> {
  const { handle } = await props.params;
  const card = await getCardByHandle(handle);
  if (!card || card.status !== "active") return { title: "member", robots: { index: false } };
  const title = `${card.name} — ${card.role}`;
  return {
    title,
    description: card.bio_md.slice(0, 160),
    alternates: { canonical: `/@${card.handle}`, types: { "text/markdown": `/@${card.handle}/llms.txt` } },
    openGraph: { title, description: card.bio_md.slice(0, 160), type: "profile" },
  };
}

export default async function VisitCard(props: PageProps<"/u/[handle]">) {
  const { handle } = await props.params;
  const card = await getCardByHandle(handle);
  if (!card) notFound();

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
      <Link href="/" aria-label="1handshake home" className="text-ink">
        <Logo size={28} />
      </Link>
      <article className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-line bg-surface p-6">
        <Avatar name={card.name} size={84} />
        <h1 className="text-[28px] leading-8 font-extrabold tracking-[-0.02em] lowercase">
          {card.name} <span className="font-semibold text-ink-muted">— {card.role}</span>
        </h1>
        {card.cities?.name && <span className="meta">{card.cities.name}</span>}
        <p className="whitespace-pre-line">{card.bio_md}</p>
        <div className="relative overflow-hidden rounded-[var(--radius-md)] bg-surface-sunk p-4" aria-label="i need and i can — visible to members">
          <p className="blur-[5px] select-none" aria-hidden>i need: something specific. i can: help with something useful in return.</p>
          <span className="absolute inset-0 grid place-items-center text-sm font-semibold">🤝 visible to members</span>
        </div>
        <pre className="rounded-[var(--radius-sm)] border border-dashed border-line-strong p-3 font-mono text-xs leading-[18px] whitespace-pre-wrap text-ink-muted">{cardToMarkdown(card)}</pre>
        <Link href="/" className={buttonClass("primary")}>how to join</Link>
      </article>
      <p className="meta text-center">1handshake.com/@{card.handle} · <Link href={`/@${card.handle}/llms.txt`}>llms.txt</Link></p>
    </main>
  );
}
