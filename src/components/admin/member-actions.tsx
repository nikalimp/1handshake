"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { closeOffer, hidePost, setBan } from "@/app/(admin)/admin/members/actions";
import { Button } from "@/components/button";

type Run = (reason: string) => Promise<{ ok: true } | { error: string }>;

/**
 * A small button that opens a reason field, then confirms. Used for ban / unban, hiding a post,
 * closing an offer. The reason goes into the admin log.
 */
function Confirmed({ label, confirm, busyLabel, needReason, variant = "ghost", run }: { label: string; confirm: string; busyLabel: string; needReason: boolean; variant?: "ghost" | "danger" | "secondary"; run: Run }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open)
    return (
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  return (
    <form
      className="flex w-full flex-col gap-2 rounded-[var(--radius-md)] bg-surface-sunk p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (needReason && !reason.trim()) return setError("write a reason");
        start(async () => {
          setError(null);
          const res = await run(reason);
          if ("error" in res) setError(res.error);
          else {
            setOpen(false);
            setReason("");
            router.refresh();
          }
        });
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">{confirm}</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder={needReason ? "reason (goes to the log)" : "reason (optional)"}
          className="h-10 rounded-full bg-surface px-4 outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--ink)]"
          autoFocus
        />
      </label>
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={pending}>
          {pending ? busyLabel : "confirm"}
        </Button>
        <Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>
          back
        </Button>
      </div>
      {error && <p className="text-sm text-fire-ink">{error}</p>}
    </form>
  );
}

export function BanControl({ id, status, name }: { id: string; status: "active" | "ghost" | "banned"; name: string }) {
  if (status === "ghost") return null;
  return status === "banned" ? (
    <Confirmed label="unban" confirm={`let ${name} back into the club?`} busyLabel="unbanning…" needReason={false} variant="secondary" run={(r) => setBan(id, false, r)} />
  ) : (
    <Confirmed label="ban" confirm={`ban ${name}? their card, offers and place in connect disappear`} busyLabel="banning…" needReason variant="danger" run={(r) => setBan(id, true, r)} />
  );
}

export function HidePostButton({ id }: { id: string }) {
  return <Confirmed label="hide" confirm="hide this post from the wall and the feed?" busyLabel="hiding…" needReason={false} run={(r) => hidePost(id, r)} />;
}

export function CloseOfferButton({ id }: { id: string }) {
  return <Confirmed label="close" confirm="close this offer? it stays on the card as closed" busyLabel="closing…" needReason={false} run={(r) => closeOffer(id, r)} />;
}

/** The side panel: Escape closes it (back to the list with the same filters). */
export function PanelShell({ closeHref, children }: { closeHref: string; children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(closeHref, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeHref, router]);
  return (
    <aside
      aria-label="member"
      className="fixed inset-0 z-30 overflow-y-auto bg-paper md:inset-y-0 md:right-0 md:left-auto md:w-[min(520px,100vw)] md:border-l md:border-line md:shadow-[var(--shadow-card)]"
    >
      {children}
    </aside>
  );
}

/** Selects in the filter bar submit the form as soon as they change. */
export function AutoSubmit({ formId }: { formId: string }) {
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const onChange = (e: Event) => {
      if ((e.target as HTMLElement).tagName === "SELECT" || (e.target as HTMLInputElement).type === "date") form.requestSubmit();
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, [formId]);
  return null;
}
