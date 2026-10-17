"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cancelEvent, newCheckinCode, reviewEvent, setGoing } from "@/app/(app)/events/actions";
import { Button, buttonClass } from "@/components/button";
import { QrCode } from "@/components/qr-code";

/** 🙋 going: intent, from the feed or the event page. Check-in happens at the venue with the QR. */
export function GoingButton({ eventId, going, count, size = "md" }: { eventId: string; going: boolean; count: number; size?: "md" | "sm" }) {
  const [on, setOn] = useState(going);
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
          const res = await setGoing(eventId, next);
          if ("error" in res) {
            setOn(!next);
            setN((x) => x + (next ? -1 : 1));
          }
        });
      }}
      className={`${size === "sm" ? "h-10 px-4 text-sm" : "h-12 px-5"} inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-transform active:scale-[.97] ${on ? "bg-fire text-on-fire" : "bg-transparent text-ink shadow-[inset_0_0_0_1.5px_var(--line-strong)]"}`}
    >
      {on ? "✓ going" : "🙋 i'm going"}
      {n > 0 && <span className="opacity-70">· {n}</span>}
    </button>
  );
}

export function RegisterLink({ href, size = "md" }: { href: string; size?: "md" | "sm" }) {
  return (
    <a href={href} target="_blank" rel="noopener" className={buttonClass("secondary", size)}>
      register ↗
    </a>
  );
}

export function ReviewButtons({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (approve: boolean) =>
    start(async () => {
      setError(null);
      const res = await reviewEvent(eventId, approve);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(true)}>
          approve
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(false)}>
          reject
        </Button>
      </div>
      {error && <p className="text-sm text-fire-ink">{error}</p>}
    </div>
  );
}

export function CancelEventButton({ eventId, slug }: { eventId: string; slug: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [pending, start] = useTransition();
  if (!ask)
    return (
      <button type="button" onClick={() => setAsk(true)} className="meta hover:text-ink">
        cancel event
      </button>
    );
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm">cancel it for everyone?</span>
      <Button
        size="sm"
        variant="danger"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await cancelEvent(eventId, slug);
            router.refresh();
          })
        }
      >
        {pending ? "cancelling…" : "yes, cancel"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setAsk(false)}>
        no
      </Button>
    </div>
  );
}

/** The host's check-in QR, full width. "new code" makes the old one (e.g. a photo of it online) stop working. */
export function CheckinQr({ eventId, appUrl, code: first }: { eventId: string; appUrl: string; code: string }) {
  const router = useRouter();
  const [code, setCode] = useState(first);
  const [ask, setAsk] = useState(false);
  const [pending, start] = useTransition();
  // the count of people checked in follows along
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(t);
  }, [router]);
  const url = `${appUrl}/in/${code}`;
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full max-w-[360px] overflow-hidden rounded-[var(--radius-lg)] bg-white p-3">
        <div className="[&_svg]:h-auto [&_svg]:w-full">
          <QrCode value={url} size={340} />
        </div>
      </div>
      <p className="meta break-all text-center">{url.replace(/^https?:\/\//, "")}</p>
      {ask ? (
        <div className="flex items-center gap-2">
          <span className="text-sm">the current qr stops working</span>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await newCheckinCode(eventId);
                if ("code" in res) setCode(res.code);
                setAsk(false);
              })
            }
          >
            {pending ? "…" : "ok, new code"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAsk(false)}>
            back
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            print
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAsk(true)}>
            new code
          </Button>
        </div>
      )}
    </div>
  );
}
