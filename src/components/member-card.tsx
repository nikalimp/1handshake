import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { ConnectCard } from "@/components/connect-card";
import type { Card } from "@/lib/data";

const first = (c: Card) => (c.name ?? "a member").split(" ")[0];

export function MemberCard({ person, mutuals, avatars }: { person: Card; mutuals: Card[]; avatars?: Map<string, string> }) {
  const src = (c: Card) => (c.avatar_path ? avatars?.get(c.avatar_path) : undefined);
  const mutualNames = mutuals.length === 1 ? first(mutuals[0]) : `${mutuals.slice(0, -1).map(first).join(", ")} and ${first(mutuals[mutuals.length - 1])}`;
  return (
    <ConnectCard personId={person.id} firstName={first(person)} mutualNames={mutualNames || "your mutuals"}>
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
      {person.bio_md && <p className="line-clamp-3 whitespace-pre-line">{person.bio_md}</p>}
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
