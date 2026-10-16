import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";

/** Plain-language draft of a legal page. To be replaced by reviewed texts before the public launch. */
export function LegalDraft({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-10">
      <Link href="/" aria-label="1handshake home" className="text-ink">
        <Logo size={28} />
      </Link>
      <h1 className="text-[32px] leading-9 font-extrabold tracking-[-0.03em]">{title}</h1>
      <p className="meta">draft · in plain words · the full text comes before the public launch</p>
      <div className="flex flex-col gap-4 text-[15px] leading-[22px]">{children}</div>
    </main>
  );
}
