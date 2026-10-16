import Link from "next/link";
import { Avatar } from "@/components/avatar";
import type { Card } from "@/lib/data";

export function MemberCard({ person, mutuals }: { person: Card; mutuals: Card[] }) {
  return (
    <article className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-surface p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-4">
        <Avatar name={person.name} size={72} />
        <div className="min-w-0">
          <h2 className="text-2xl leading-7 font-extrabold tracking-[-0.02em] lowercase">{person.name}</h2>
          <p className="text-[15px] leading-5 text-ink-muted">{person.role}</p>
          {person.handle && (
            <Link href={`/@${person.handle}`} className="meta mt-1.5 block">
              @{person.handle} · 2nd
            </Link>
          )}
        </div>
      </div>
      {person.bio_md && <p className="line-clamp-3 whitespace-pre-line">{person.bio_md}</p>}
      <div className="flex items-center gap-2 border-t border-line pt-4">
        <span className="flex">
          {mutuals.slice(0, 3).map((m, i) => (
            <span key={m.id} className={i ? "-ml-2" : ""}>
              <Avatar name={m.name} size={28} />
            </span>
          ))}
        </span>
        <span className="meta">via {mutuals.map((m) => (m.name ?? "").split(" ")[0]).join(", ")}</span>
      </div>
      {/* skip / connect wire up to request_intro() and hidden in the next step */}
      <div className="grid grid-cols-2 gap-3">
        <button className="h-12 rounded-full bg-surface-sunk font-semibold" disabled>skip</button>
        <button className="h-12 rounded-full bg-fire font-semibold text-on-fire" disabled>connect</button>
      </div>
    </article>
  );
}
