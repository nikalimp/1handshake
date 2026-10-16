import { cleanLinks, LINK_KINDS, linkLabel } from "@/lib/links";

/** The card's social links as a row of chips. Renders nothing when there are none. */
export function SocialLinks({ links }: { links: unknown }) {
  const clean = cleanLinks(links);
  const items = LINK_KINDS.filter((k) => clean[k.key]);
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="links">
      {items.map((k) => (
        <li key={k.key}>
          <a
            href={clean[k.key]}
            target="_blank"
            rel="noopener noreferrer me"
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-sm hover:border-line-strong"
          >
            <span className="text-ink-muted">{k.label}</span>
            <span className="font-semibold">{linkLabel(k.key, clean[k.key]!)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
