"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import { resolveHandshake } from "./actions";

export function Decision({ inviteId, names }: { inviteId: string; names: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (cancel: boolean) =>
    start(async () => {
      setError(null);
      const res = await resolveHandshake(inviteId, cancel);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  return (
    <div className="flex flex-col gap-2">
      {ask ? (
        <>
          <p className="text-sm">cancel the handshake between {names}? if they had an intro before, they stay connected through it.</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => run(true)}>
              {pending ? "cancelling…" : "yes, cancel it"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAsk(false)}>
              back
            </Button>
          </div>
        </>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(false)}>
            {pending ? "saving…" : "looks real · keep"}
          </Button>
          <Button size="sm" onClick={() => setAsk(true)}>
            fake · cancel connection
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-fire-ink">{error}</p>}
    </div>
  );
}
