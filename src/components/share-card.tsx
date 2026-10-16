"use client";
import { useEffect, useState } from "react";
import { Button, buttonClass } from "@/components/button";
import { QrCode } from "@/components/qr-code";
import { CARD_URL } from "@/lib/env";

/** "share" → a sheet with the public card's QR, the link, copy and the phone's share menu. */
export function ShareCard({ handle, name }: { handle: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = `${CARD_URL}/@${handle}`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        share
      </Button>
      {open && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="share your card"
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-sm flex-col items-center gap-4 rounded-[var(--radius-lg)] bg-surface p-6 pb-[calc(24px+env(safe-area-inset-bottom,0px))] shadow-[var(--shadow-card)]"
          >
            <p className="self-start font-semibold">your card</p>
            <div className="rounded-[var(--radius-md)] bg-white p-2">
              <QrCode value={url} size={220} />
            </div>
            <a href={url} target="_blank" rel="noopener" className="meta break-all text-center underline-offset-2 hover:text-ink hover:underline">
              {url.replace(/^https?:\/\//, "")} ↗
            </a>
            <div className="grid w-full grid-cols-2 gap-2">
              <Button variant="secondary" onClick={copy}>
                {copied ? "copied ✓" : "copy link"}
              </Button>
              {typeof navigator !== "undefined" && "share" in navigator ? (
                <Button onClick={() => navigator.share({ title: `${name} · 1handshake`, url }).catch(() => {})}>share…</Button>
              ) : (
                <a href={url} target="_blank" rel="noopener" className={buttonClass("primary")}>
                  open card
                </a>
              )}
            </div>
            <button type="button" onClick={() => setOpen(false)} className="meta hover:text-ink">
              close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
