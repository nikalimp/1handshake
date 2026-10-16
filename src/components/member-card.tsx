import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { ConnectCard } from "@/components/connect-card";
import { plainText } from "@/components/markdown";
import type { Card } from "@/lib/data";
import type { Side } from "@/lib/match";

const first = (c: Card) => (c.name ?? "a member").split(" ")[0];

export function MemberCard({ person, mutuals, avatars, match, side }: { person: Card; mutuals: Card[]; avatars?: Map<string, string>; match?: string; side?: Side }) {
  const src = (c: Card) => (c.avatar_path ? avatars?.get(c.avatar_path) : undefined);
  const mutualNames = mutuals.length === 1 ? first(mutuals[0]) : `${mutuals.slice(0, -1).map(first).join(", ")} and ${first(mutuals[mutuals.length - 1])}`;
  return (
    <ConnectCard personId={person.id} firstName={first(person)} mutualNames={mutualNames || "your mutuals"}>
      {match && (
        <p className="-mt-1 flex items-start gap-2 rounded-[var(--radius-md)] bg-fire-soft px-3.5 py-2.5 text-sm text-fire-ink">
          <span className="shrink-0 font-bold">match</span>
          <span>{match}</span>
        </p>
      )}
      <div className="flex items-center gap-4">
        <Avatar name={person.name} size={72} src={src(person)} />
        <div className="min-w-0">
          <h2 className="text-2xl leading-7 font-extrabold tracking-[-0.02em]">
            <Link href={`/people/${person.handle}`}>{person.name}</Link>
          </h2>
          <p className="text-[15px] leading-5 text-ink-muted">{person.role}</p>
          {person.handle && <p className="meta mt-1.5">@{person.handle} · 2nd</p>}
        </div>
      </div>
      {person.bio_md && <p className="line-clamp-3 whitespace-pre-line">{plainText(person.bio_md)}</p>}
      {side && (side.needs.length > 0 || side.cans.length > 0) && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {side.needs.length > 0 && (
            <>
              <dt className="meta pt-px">needs</dt>
              <dd>{side.needs.join(" · ")}</dd>
            </>
          )}
          {side.cans.length > 0 && (
            <>
              <dt className="meta pt-px">can</dt>
              <dd>{side.cans.join(" · ")}</dd>
            </>
          )}
        </dl>
      )}
      <div className="flex items-center gap-2 border-t border-line pt-4">
        <span className="flex">
          {mutuals.slice(0, 3).map((m, i) => (
            <span key={m.id} className={i ? "-ml-2" : ""}>
              <Avatar name={m.name} size={28} src={src(m)} />
            </span>
          ))}
        </span>
        <span className="meta">via {mutuals.map(first).join(", ")}</span>
      </div>
    </ConnectCard>
  );
}
