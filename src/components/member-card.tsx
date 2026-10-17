import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { ConnectCard } from "@/components/connect-card";
import { plainText } from "@/components/markdown";
import type { Card } from "@/lib/data";
import { kindLabel, type Offer } from "@/lib/offers";

const first = (c: Card) => (c.name ?? "a member").split(" ")[0];

/** Someone to connect with: one handshake away (via mutuals) or from an event we both checked in at. */
export function MemberCard({ person, mutuals, avatars, offers = [], event }: { person: Card; mutuals: Card[]; avatars?: Map<string, string>; offers?: Offer[]; event?: { id: string; title: string; cover: string | null } }) {
  const src = (c: Card) => (c.avatar_path ? avatars?.get(c.avatar_path) : undefined);
  const mutualNames = mutuals.length === 0 ? "" : mutuals.length === 1 ? first(mutuals[0]) : `${mutuals.slice(0, -1).map(first).join(", ")} and ${first(mutuals[mutuals.length - 1])}`;
  return (
    <ConnectCard personId={person.id} firstName={first(person)} mutualNames={mutualNames || "your mutuals"} eventId={event?.id}>
      <div className="flex items-center gap-4">
        <Avatar name={person.name} size={72} src={src(person)} />
        <div className="min-w-0">
          <h2 className="text-2xl leading-7 font-extrabold tracking-[-0.02em]">
            <Link href={`/people/${person.handle}`}>{person.name}</Link>
          </h2>
          <p className="text-[15px] leading-5 text-ink-muted">{person.role}</p>
          {person.handle && <p className="meta mt-1.5">@{person.handle} · {event ? "met at an event" : "2nd"}</p>}
        </div>
      </div>
      {person.bio_md && <p className="line-clamp-3 whitespace-pre-line">{plainText(person.bio_md)}</p>}
      {offers.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {offers.slice(0, 3).map((o) => (
            <li key={o.id} className="flex items-baseline gap-2">
              <span className="meta shrink-0 rounded-full bg-surface-sunk px-2 py-0.5 text-ink">{kindLabel(o.kind)}</span>
              <span className="min-w-0 truncate">{o.title}</span>
            </li>
          ))}
          {offers.length > 3 && <li className="meta">+{offers.length - 3} more on the profile</li>}
        </ul>
      )}
      {event ? (
        <div className="flex items-center gap-2 border-t border-line pt-4">
          {event.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.cover} alt="" className="h-7 w-7 rounded-full object-cover" />
          ) : (
            <span aria-hidden>🎟</span>
          )}
          <span className="meta">you were both at {event.title}</span>
        </div>
      ) : (
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
      )}
    </ConnectCard>
  );
}
