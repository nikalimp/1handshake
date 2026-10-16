"use client";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { buttonClass } from "@/components/button";

type Person = { id: string; name: string; role: string; handle: string | null; city: string | null; avatar: string | null; kind: "met" | "intro"; since: string };

const day = new Intl.DateTimeFormat("en", { month: "short", year: "numeric" });

export function ConnectionsList({ people }: { people: Person[] }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "met" | "intro">("all");
  const term = q.trim().toLowerCase();
  const shown = people.filter((p) => (kind === "all" || p.kind === kind) && (!term || [p.name, p.role, p.city, p.handle].some((v) => v?.toLowerCase().includes(term))));
  const met = people.filter((p) => p.kind === "met").length;

  if (!people.length) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-ink-muted">no connections yet. meet a member and make a handshake.</p>
        <Link href="/invite" className={buttonClass("primary")}>
          + invite
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="search by name, role or city"
        aria-label="search connections"
        className="h-11 w-full rounded-full border border-line bg-surface px-4 outline-none focus:border-line-strong"
      />
      <div className="flex gap-1 self-start rounded-full bg-surface-sunk p-1 text-sm font-semibold" role="tablist">
        {(
          [
            ["all", `all ${people.length}`],
            ["met", `🤝 met ${met}`],
            ["intro", `🔗 intro ${people.length - met}`],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={`rounded-full px-3 py-1 ${kind === k ? "bg-surface shadow-sm" : "text-ink-muted"}`}>
            {label}
          </button>
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {shown.map((p) => {
          const body = (
            <>
              <Avatar name={p.name} size={44} src={p.avatar} met={p.kind === "met"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.name}</span>
                <span className="block truncate text-sm text-ink-muted">{p.role}</span>
                <span className="meta block">
                  {[p.city, `${p.kind === "met" ? "🤝 met" : "🔗 intro"} ${day.format(new Date(p.since)).toLowerCase()}`].filter(Boolean).join(" · ")}
                </span>
              </span>
            </>
          );
          return (
            <li key={p.id}>
              {p.handle ? (
                <Link href={`/people/${p.handle}`} className="flex items-center gap-3 rounded-[var(--radius-md)] bg-surface px-3 py-2.5 shadow-[var(--shadow-card)]">
                  {body}
                </Link>
              ) : (
                <div className="flex items-center gap-3 rounded-[var(--radius-md)] bg-surface px-3 py-2.5 opacity-70 shadow-[var(--shadow-card)]">{body}</div>
              )}
            </li>
          );
        })}
        {shown.length === 0 && <li className="meta px-1 py-4 text-center">nobody matches</li>}
      </ul>
    </div>
  );
}
