"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteOffer, saveOffer, setInterest, setOfferClosed, type OfferInput } from "@/app/(app)/offers/actions";
import { Button, buttonClass } from "@/components/button";
import { MarkdownField } from "@/components/markdown-field";
import { OFFER_KINDS } from "@/lib/offers";

/** "i'm interested" — the author sees who. */
export function InterestButton({ offerId, interested, count }: { offerId: string; interested: boolean; count: number }) {
  const [on, setOn] = useState(interested);
  const [n, setN] = useState(count);
  const [, start] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        const next = !on;
        setOn(next);
        setN((x) => x + (next ? 1 : -1));
        start(async () => {
          const res = await setInterest(offerId, next);
          if ("error" in res) {
            setOn(!next);
            setN((x) => x + (next ? -1 : 1));
          }
        });
      }}
      className={`inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-transform active:scale-[.97] ${on ? "bg-fire-soft text-fire-ink" : "bg-fire text-on-fire"}`}
    >
      {on ? "✓ interested" : "i'm interested"}
      {n > 0 && <span className="opacity-70">· {n}</span>}
    </button>
  );
}

export function OfferOwnerControls({ offerId, closed }: { offerId: string; closed: boolean }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (f: () => Promise<{ ok: true } | { error: string }>) =>
    start(async () => {
      setError(null);
      const res = await f();
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/offers/${offerId}/edit`} className={buttonClass("secondary", "sm")}>
          edit
        </Link>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setOfferClosed(offerId, !closed))}>
          {closed ? "reopen" : "close"}
        </Button>
        {ask ? (
          <>
            <Button size="sm" variant="danger" disabled={pending} onClick={() => run(() => deleteOffer(offerId))}>
              yes, delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAsk(false)}>
              no
            </Button>
          </>
        ) : (
          <button type="button" onClick={() => setAsk(true)} className="meta px-1 hover:text-ink">
            delete
          </button>
        )}
      </div>
      {error && <p className="text-sm text-fire-ink">{error}</p>}
    </div>
  );
}

const field = "w-full rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3 outline-none focus:border-line-strong";

export function OfferForm({ offerId, initial }: { offerId: string | null; initial: OfferInput }) {
  const router = useRouter();
  const [f, setF] = useState<OfferInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof OfferInput>(k: K, v: OfferInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const kind = OFFER_KINDS.find((k) => k.id === f.kind);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="meta">what is it</span>
        <div className="grid grid-cols-4 gap-1 rounded-full bg-surface-sunk p-1" role="radiogroup" aria-label="kind">
          {OFFER_KINDS.map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={f.kind === k.id} onClick={() => set("kind", k.id)} className={`rounded-full py-2 text-sm font-semibold ${f.kind === k.id ? "bg-ink text-paper" : "text-ink-muted"}`}>
              {k.label}
            </button>
          ))}
        </div>
        {kind && <p className="meta px-1">{kind.hint}</p>}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="meta">title</span>
        <input value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={120} placeholder={f.kind === "order" ? "e.g. need a backend engineer for 3 months" : f.kind === "project" ? "e.g. looking for a cofounder for an ai notes app" : f.kind === "product" ? "e.g. selling a used macbook pro m3" : "e.g. brand identity in two weeks"} className={`${field} text-[18px] font-bold`} />
      </label>
      <MarkdownField label="details" value={f.body_md} onChange={(v) => set("body_md", v)} maxLength={2000} rows={6} placeholder="what exactly, for whom, timing, conditions" />
      <div className="grid grid-cols-[2fr_3fr] gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="meta">price · optional</span>
          <input value={f.price} onChange={(e) => set("price", e.target.value)} maxLength={40} placeholder="e.g. $500" className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="meta">link · optional</span>
          <input value={f.link} onChange={(e) => set("link", e.target.value)} maxLength={500} inputMode="url" placeholder="https://…" className={field} />
        </label>
      </div>
      {error && (
        <p role="alert" className="rounded-[var(--radius-md)] bg-fire-soft px-4 py-3 text-sm text-fire-ink">
          {error}
        </p>
      )}
      <Button
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await saveOffer(offerId, f);
            if ("error" in res) setError(res.error);
            else {
              router.push("/profile#offers");
              router.refresh();
            }
          })
        }
      >
        {pending ? "saving…" : offerId ? "save" : "publish offer"}
      </Button>
      <p className="meta -mt-2 text-center">offers are public on your card · members can say they&apos;re interested · your connections see new ones in the feed</p>
    </div>
  );
}
