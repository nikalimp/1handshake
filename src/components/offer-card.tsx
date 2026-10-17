import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Markdown } from "@/components/markdown";
import { ReportOffer } from "@/components/moderation";
import { InterestButton, OfferOwnerControls } from "@/components/offer-controls";
import { kindLabel, type Offer } from "@/lib/offers";

export type Interested = { id: string; name: string | null; handle: string | null; avatar: string | null };

/**
 * One offer. `viewer`: "owner" edits it and sees who is interested; "member" can say "i'm interested";
 * "guest" (the public card) only reads it.
 */
export function OfferCard({ offer, viewer, count = 0, mine = false, interested = [], clamp = false }: { offer: Offer; viewer: "owner" | "member" | "guest"; count?: number; mine?: boolean; interested?: Interested[]; clamp?: boolean }) {
  const closed = Boolean(offer.closed_at);
  const hidden = Boolean(offer.hidden_at || offer.flagged_at);
  return (
    <article className={`flex flex-col gap-2.5 rounded-[var(--radius-md)] border border-line bg-surface p-4 ${closed ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="meta rounded-full bg-surface-sunk px-2.5 py-1 text-ink">{kindLabel(offer.kind)}</span>
        <span className="meta">{closed ? "closed" : offer.price}</span>
      </div>
      {hidden && (
        <p className="rounded-[var(--radius-sm)] bg-fire-soft px-3 py-2 text-sm text-fire-ink">
          {offer.hidden_at ? `hidden by moderators${offer.hidden_reason ? `: ${offer.hidden_reason}` : ""}` : "hidden after reports. a moderator will check it soon."}
          {viewer === "owner" && " only you can see it."}
        </p>
      )}
      <h3 className="text-[17px] leading-6 font-bold">{offer.title}</h3>
      {offer.body_md && <div className={clamp ? "line-clamp-4" : ""}><Markdown source={offer.body_md} /></div>}
      {offer.link && (
        <a href={offer.link} target="_blank" rel="noopener nofollow" className="meta w-fit truncate hover:text-ink">
          {offer.link.replace(/^https:\/\/(www\.)?/, "")} ↗
        </a>
      )}
      {viewer === "member" && !closed && !hidden && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <InterestButton offerId={offer.id} interested={mine} count={count} />
          <ReportOffer offerId={offer.id} />
        </div>
      )}
      {viewer === "guest" && !closed && count > 0 && <p className="meta">{count} interested</p>}
      {viewer === "owner" && (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          {interested.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="meta">interested · {interested.length}</p>
              <ul className="flex flex-wrap gap-2">
                {interested.map((p) => (
                  <li key={p.id}>
                    <Link href={p.handle ? `/people/${p.handle}` : "#"} className="flex items-center gap-2 rounded-full bg-surface-sunk py-1 pr-3 pl-1 text-sm font-semibold">
                      <Avatar name={p.name} size={26} src={p.avatar} />
                      {p.name?.split(" ")[0] ?? "a member"}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            !closed && <p className="meta">no one interested yet</p>
          )}
          <OfferOwnerControls offerId={offer.id} closed={closed} />
        </div>
      )}
    </article>
  );
}
