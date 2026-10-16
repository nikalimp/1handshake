"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { backRequest, respondRequest } from "@/app/(app)/feed/actions";

export function RequestActions({ requestId, firstName }: { requestId: string; firstName: string }) {
  const router = useRouter();
  const [done, setDone] = useState<null | "accepted" | "declined">(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const answer = (accept: boolean) =>
    start(async () => {
      setError(null);
      const res = await respondRequest(requestId, accept);
      if ("error" in res) setError(res.error);
      else {
        setDone(accept ? "accepted" : "declined");
        router.refresh();
      }
    });
  if (done) return <p className="meta">{done === "accepted" ? `🔗 you and ${firstName} are connected` : "declined"}</p>;
  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-fire-ink">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" disabled={pending} onClick={() => answer(false)} className="h-11 rounded-full bg-surface-sunk font-semibold transition-transform active:scale-[.97]">
          decline
        </button>
        <button type="button" disabled={pending} onClick={() => answer(true)} className="h-11 rounded-full bg-fire font-semibold text-on-fire transition-transform active:scale-[.97]">
          accept
        </button>
      </div>
    </div>
  );
}

export function BackButton({ requestId, backed }: { requestId: string; backed: boolean }) {
  const [on, setOn] = useState(backed);
  const [, start] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        const next = !on;
        setOn(next);
        start(() => backRequest(requestId, next));
      }}
      className={`h-11 rounded-full px-5 font-semibold transition-transform active:scale-[.97] ${on ? "bg-fire-soft text-fire-ink" : "bg-fire text-on-fire"}`}
    >
      {on ? "🔥 backed · undo" : "🔥 back it"}
    </button>
  );
}
