import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Markdown } from "@/components/markdown";

/** A legal page from src/content/<name>.md (read at build time; the same text is published on 1handshake.com). */
export function LegalPage({ name }: { name: "terms" | "privacy" }) {
  const source = readFileSync(join(process.cwd(), "src/content", `${name}.md`), "utf8");
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-5 px-5 py-10">
      <Link href="/" aria-label="1handshake home" className="text-ink">
        <Logo size={28} />
      </Link>
      <article className="legal flex flex-col gap-4 text-[15px] leading-[23px]">
        <Markdown source={source} />
      </article>
      <p className="meta border-t border-line pt-5">
        <Link href="/terms">terms</Link> · <Link href="/privacy">privacy</Link> · open source
      </p>
    </main>
  );
}
