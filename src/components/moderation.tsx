"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeConnection, reportHandshake, reportMember, reportOffer } from "@/app/(app)/people/actions";
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

const OFFER_REASONS = ["spam or scam", "misleading", "not allowed in the club", "something else"];
const MEMBER_REASONS = ["fake profile", "spam or unwanted intros", "harassment", "something else"];

/** A reason picker with an optional note, shared by offer and member reports. */
function ReportForm({ reasons, intro, cta, send, onCancel }: { reasons: string[]; intro: string; cta: string; send: (reason: string) => Promise<{ ok: true } | { error: string }>; onCancel: () => void }) {
  const [reason, setReason] = useState(reasons[0]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  if (done) return <p className="meta">reported · thanks. a moderator will look at it.</p>;
  return (
    <form
      className="flex w-full flex-col gap-2 rounded-[var(--radius-md)] bg-surface-sunk p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await send(note.trim() ? `${reason}: ${note.trim()}` : reason);
          if ("error" in res) setError(res.error);
          else setDone(true);
        });
      }}
    >
      <p className="text-sm">{intro}</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="reason">
        {reasons.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={reason === r}
            onClick={() => setReason(r)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${reason === r ? "bg-ink text-paper" : "bg-surface text-ink"}`}
          >
            {r}
          </button>
        ))}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
        placeholder="a few words for the moderator (optional)"
        className="h-10 rounded-full bg-surface px-4 text-sm outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--ink)]"
      />
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={pending}>
          {pending ? "sending…" : cta}
        </Button>
        <Button size="sm" type="button" variant="ghost" onClick={onCancel}>
          cancel
        </Button>
      </div>
      {error && <p className="text-sm text-fire-ink">{error}</p>}
    </form>
  );
}

/** "report" on someone else's offer. Three reports hide it until a moderator checks. */
export function ReportOffer({ offerId }: { offerId: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="meta shrink-0 hover:text-ink">
        report
      </button>
    );
  return (
    <ReportForm
      reasons={OFFER_REASONS}
      intro="what's wrong with this offer? after 3 reports it hides until a moderator checks it."
      cta="report offer"
      send={(r) => reportOffer(offerId, r)}
      onCancel={() => setOpen(false)}
    />
  );
}

/** "report" on a member's profile. Goes to the moderators; nothing changes for them until then. */
export function ReportMember({ profileId, name }: { profileId: string; name: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="meta hover:text-ink">
        report {name}
      </button>
    );
  return (
    <ReportForm
      reasons={MEMBER_REASONS}
      intro={`tell the moderators what's wrong. ${name} won't know who reported.`}
      cta="send report"
      send={(r) => reportMember(profileId, r)}
      onCancel={() => setOpen(false)}
    />
  );
}
