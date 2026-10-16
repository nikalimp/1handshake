"use client";
import Link from "next/link";
import { useState } from "react";

/** "i need / i can" on a member's profile, as two tabs. */
export function NeedsTabs({ needs, cans, isMe, firstName }: { needs: string[]; cans: string[]; isMe: boolean; firstName: string }) {
  const [tab, setTab] = useState<"need" | "can">(needs.length || !cans.length ? "need" : "can");
  if (!needs.length && !cans.length) {
    if (!isMe) return null;
    return (
      <Link href="/profile/edit" className="rounded-[var(--radius-md)] border border-dashed border-line-strong px-4 py-3 text-sm text-ink-muted">
        + add what you need and what you can — connect shows you matches
      </Link>
    );
  }
  const list = tab === "need" ? needs : cans;
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-md)] bg-surface-sunk p-3">
      <div className="flex gap-1 self-start rounded-full bg-surface p-1 text-sm font-semibold" role="tablist">
        {(["need", "can"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-full px-3 py-1 ${tab === t ? "bg-ink text-paper" : "text-ink-muted"}`}>
            {isMe ? `i ${t}` : `${firstName.toLowerCase()} ${t === "need" ? "needs" : "can"}`}
            {(t === "need" ? needs : cans).length > 0 && <span className="ml-1 opacity-60">{(t === "need" ? needs : cans).length}</span>}
          </button>
        ))}
      </div>
      {list.length ? (
        <ul className="flex flex-col gap-1.5 px-1">
          {list.map((x) => (
            <li key={x} className="flex gap-2">
              <span aria-hidden className="text-fire">•</span>
              <span>{x}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="meta px-1">nothing here yet</p>
      )}
    </div>
  );
}
