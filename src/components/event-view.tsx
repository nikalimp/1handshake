import { coverUrl, formatWhen, tzLabel } from "@/lib/event-format";

type Facts = {
  title: string;
  cover_path: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  online: boolean;
  venue: string | null;
  address: string | null;
  price: string | null;
};

export function EventCover({ path, title, className = "" }: { path: string | null; title: string; className?: string }) {
  const src = coverUrl(path);
  if (!src)
    return (
      <div className={`grid aspect-square w-full place-items-center bg-surface-sunk text-6xl ${className}`} aria-hidden>
        🎟
      </div>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={`cover of ${title}`} className={`aspect-square w-full object-cover ${className}`} />;
}

/** When, where and how much — the lines under the title. */
export function EventFacts({ ev, city, compact = false }: { ev: Facts; city?: string | null; compact?: boolean }) {
  const mapQuery = [ev.venue, ev.address, city].filter(Boolean).join(", ");
  return (
    <dl className={`grid grid-cols-[auto_1fr] items-baseline gap-x-3 ${compact ? "gap-y-0.5 text-sm" : "gap-y-1.5"}`}>
      <dt aria-label="when">🗓</dt>
      <dd>
        {formatWhen(ev)} <span className="meta">{tzLabel(ev.timezone)}</span>
      </dd>
      <dt aria-label="where">📍</dt>
      <dd>
        {ev.online ? (
          "online"
        ) : mapQuery ? (
          compact ? (
            [ev.venue, city].filter(Boolean).join(" · ")
          ) : (
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener" className="hover:underline">
              {ev.venue && <span className="font-semibold">{ev.venue}</span>}
              {ev.venue && (ev.address || city) && <br />}
              <span className={ev.venue ? "text-ink-muted" : ""}>{[ev.address, city].filter(Boolean).join(", ")}</span>
            </a>
          )
        ) : (
          "place to be announced"
        )}
      </dd>
      {ev.price && (
        <>
          <dt aria-label="price">🎫</dt>
          <dd>{ev.price}</dd>
        </>
      )}
    </dl>
  );
}
