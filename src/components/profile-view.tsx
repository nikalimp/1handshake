import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { Markdown } from "@/components/markdown";
import { ReportHandshake } from "@/components/moderation";
import { FireButton, RemovePost, WallComposer } from "@/components/wall-controls";
import type { Card } from "@/lib/data";
import type { LoadedProfile } from "@/lib/profile";

const day = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });
const when = (iso: string) => day.format(new Date(iso)).toLowerCase();
const firstName = (p?: Card | null) => (p?.name ?? "a member").split(" ")[0];

function PersonLink({ person, children }: { person?: Card | null; children: ReactNode }) {
  if (!person?.handle) return <>{children}</>;
  return (
    <Link href={`/people/${person.handle}`} className="hover:underline">
      {children}
    </Link>
  );
}

/** Internal profile: the visit card for members, plus the wall. Used for my profile and for others. */
export function ProfileView({ data, me, actions }: { data: LoadedProfile; me: Card; actions?: ReactNode }) {
  const { person, isMe, connection, wall, people, avatars, selfies, spheres } = data;
  const canWrite = isMe || connection !== null;

  return (
    <div className="flex flex-col gap-6">
      <article className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-surface p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-start justify-between gap-3">
          <Avatar name={person.name} size={84} src={avatars.get(person.avatar_path ?? "")} met={connection === "met"} />
          {actions}
        </div>
        <div>
          <h1 className="text-[28px] leading-8 font-extrabold tracking-[-0.02em]">{person.name}</h1>
          <p className="mt-1 text-[17px] leading-6 font-semibold text-ink-muted">{person.role}</p>
          <p className="meta mt-2">
            @{person.handle}
            {person.cities?.name && ` · ${person.cities.name}`}
            {connection === "met" && " · 🤝 met in person"}
            {connection === "intro" && " · 🔗 connected"}
          </p>
        </div>
        {spheres.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="spheres">
            {spheres.map((s, i) => (
              <li key={s} className={`rounded-full px-3 py-1 text-sm ${i === 0 ? "bg-fire-soft font-semibold text-fire-ink" : "bg-surface-sunk"}`}>
                {s}
              </li>
            ))}
          </ul>
        )}
        {person.bio_md && <Markdown source={person.bio_md} />}
      </article>

      <section className="flex flex-col gap-4" aria-label="wall">
        <h2 className="px-0.5 text-[22px] leading-7 font-extrabold tracking-[-0.02em]">wall</h2>
        {canWrite && <WallComposer ownerId={person.id} placeholder={isMe ? "share what you're up to" : `write on ${firstName(person)}'s wall`} />}

        {wall.map((item) => {
          const author = people.get(item.author_id);
          if (item.kind === "handshake") {
            const other = item.other_id ? people.get(item.other_id) : null;
            const selfie = item.selfie_path ? selfies.get(item.selfie_path) : null;
            return (
              <article key={`h-${item.id}`} className="overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]">
                {selfie ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selfie} alt={`${person.name} and ${other?.name ?? "a member"} met in person`} className="aspect-square w-full object-cover" />
                ) : (
                  <div className="grid aspect-[2/1] w-full place-items-center bg-surface-sunk text-5xl">🤝</div>
                )}
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <Avatar name={other?.name ?? null} size={36} src={avatars.get(other?.avatar_path ?? "")} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      🤝 {firstName(person)} &amp; <PersonLink person={other}>{other?.name ?? "a member"}</PersonLink> met in person
                    </p>
                    <p className="meta">
                      {author && author.id !== person.id ? `invited by ${author.name} · ` : ""}
                      {when(item.at)}
                    </p>
                  </div>
                  {selfie && !isMe && item.other_id !== me.id && <ReportHandshake inviteId={item.id} />}
                </div>
              </article>
            );
          }
          const mine = item.author_id === me.id || isMe;
          return (
            <article key={`p-${item.id}`} className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
              <div className="flex items-center gap-3">
                <Avatar name={author?.name ?? null} size={36} src={avatars.get(author?.avatar_path ?? "")} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    <PersonLink person={author}>{author?.name ?? "a member"}</PersonLink>
                  </p>
                  <p className="meta">{when(item.at)}</p>
                </div>
              </div>
              <p className="whitespace-pre-line">{item.body}</p>
              <div className="flex items-center justify-between">
                <FireButton postId={item.id} fires={item.fires} fired={item.fired} />
                {mine && <RemovePost postId={item.id} />}
              </div>
            </article>
          );
        })}

        {wall.length === 0 && <p className="meta px-0.5">nothing on the wall yet</p>}
      </section>
    </div>
  );
}
