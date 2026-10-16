"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeConnection, reportHandshake } from "@/app/(app)/people/actions";
import { Button } from "@/components/button";

/** "report" under someone else's handshake: an inline confirm, then a quiet thank-you. */
export function ReportHandshake({ inviteId }: { inviteId: string }) {
  const [state, setState] = useState<"idle" | "ask" | "done" | "error">("idle");
  const [pending, start] = useTransition();
  if (state === "done") return <span className="meta">reported · thanks</span>;
  if (state === "idle" || state === "error")
    return (
      <button type="button" onClick={() => setState("ask")} className="meta shrink-0 hover:text-ink">
        {state === "error" ? "try again" : "report"}
      </button>
    );
  return (
    <div className="flex w-full flex-col gap-2 rounded-[var(--radius-md)] bg-surface-sunk p-3">
      <p className="text-sm">
        selfie looks fake or isn&apos;t them? after 3 reports it hides and an admin checks the handshake.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await reportHandshake(inviteId);
              setState("error" in res ? "error" : "done");
            })
          }
        >
          {pending ? "sending…" : "report fake handshake"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setState("idle")}>
          cancel
        </Button>
      </div>
    </div>
  );
}

/** On a connection's profile: remove them, after a confirm. */
export function RemoveConnection({ otherId, name }: { otherId: string; name: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [pending, start] = useTransition();
  if (!ask)
    return (
      <button type="button" onClick={() => setAsk(true)} className="meta hover:text-ink">
        remove connection
      </button>
    );
  return (
    <div className="flex w-full flex-col items-center gap-3 rounded-[var(--radius-lg)] bg-surface p-4 text-center shadow-[var(--shadow-card)]">
      <p className="text-sm">
        remove {name} from your connections? your handshake leaves both walls and the graph. they won&apos;t be notified.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await removeConnection(otherId);
              setAsk(false);
              router.refresh();
            })
          }
        >
          {pending ? "removing…" : "remove"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAsk(false)}>
          keep
        </Button>
      </div>
    </div>
  );
}
