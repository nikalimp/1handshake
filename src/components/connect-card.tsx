"use client";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { requestIntro, skipPerson, unskipPerson } from "@/app/(app)/connect/actions";

type State = "idle" | "skipped" | "requested";

/** A person in connect: their card, then skip / connect. Reacts right away, the server follows. */
export function ConnectCard({ personId, firstName, mutualNames, children }: { personId: string; firstName: string; mutualNames: string; children: ReactNode }) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (state === "skipped") {
    return (
      <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-dashed border-line-strong px-5 py-4">
        <span className="text-ink-muted">skipped {firstName}</span>
        <button
          type="button"
          className="text-sm font-semibold underline underline-offset-2"
          onClick={() => {
            setState("idle");
            start(() => unskipPerson(personId));
          }}
        >
          undo
        </button>
      </div>
    );
  }

  return (
    <article className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-surface p-6 shadow-[var(--shadow-card)]">
      {children}
      {state === "requested" ? (
        <p className="rounded-[var(--radius-md)] bg-fire-soft px-4 py-3 text-sm text-fire-ink">
          request sent. {mutualNames} will be asked to back it with a 🔥 — {firstName} sees it in their feed.
        </p>
      ) : (
        <>
          {error && <p className="text-sm text-fire-ink">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={pending}
              className="h-12 rounded-full bg-surface-sunk font-semibold transition-transform active:scale-[.97]"
              onClick={() => {
                setState("skipped");
                start(() => skipPerson(personId));
              }}
            >
              skip
            </button>
            <button
              type="button"
              disabled={pending}
              className="h-12 rounded-full bg-fire font-semibold text-on-fire transition-transform active:scale-[.97] disabled:opacity-60"
              onClick={() =>
                start(async () => {
                  setError(null);
                  const res = await requestIntro(personId);
                  if ("error" in res) setError(res.error);
                  else setState("requested");
                })
              }
            >
              {pending ? "sending…" : "connect"}
            </button>
          </div>
        </>
      )}
    </article>
  );
}
