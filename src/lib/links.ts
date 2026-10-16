// Social links on the card. Stored as full https URLs; members can type a handle or paste a link.

export const LINK_KINDS = [
  { key: "telegram", label: "telegram", base: "https://t.me/", hosts: ["t.me", "telegram.me"], placeholder: "@username" },
  { key: "linkedin", label: "linkedin", base: "https://www.linkedin.com/in/", hosts: ["linkedin.com", "www.linkedin.com"], placeholder: "linkedin.com/in/you" },
  { key: "x", label: "x", base: "https://x.com/", hosts: ["x.com", "twitter.com", "www.x.com", "www.twitter.com"], placeholder: "@username" },
  { key: "github", label: "github", base: "https://github.com/", hosts: ["github.com", "www.github.com"], placeholder: "username" },
  { key: "website", label: "website", base: "", hosts: [], placeholder: "yoursite.com" },
] as const;

export type LinkKey = (typeof LINK_KINDS)[number]["key"];
export type Links = Partial<Record<LinkKey, string>>;

/** A typed handle or a pasted link → a clean https URL, or an error message. Empty → null. */
export function normalizeLink(key: LinkKey, raw: string): { url: string | null } | { error: string } {
  const kind = LINK_KINDS.find((k) => k.key === key)!;
  const v = raw.trim();
  if (!v) return { url: null };
  const looksLikeUrl = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/|$)/i.test(v) && (kind.key === "website" || v.includes("/") || v.includes("."));
  if (looksLikeUrl) {
    let u: URL;
    try {
      u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    } catch {
      return { error: `${kind.label}: that link doesn't look right` };
    }
    if (kind.hosts.length && !(kind.hosts as readonly string[]).includes(u.hostname.toLowerCase())) return { error: `${kind.label}: use a ${kind.hosts[0]} link` };
    if (kind.hosts.length && u.pathname.replace(/\//g, "") === "") return { error: `${kind.label}: add your username to the link` };
    u.protocol = "https:";
    u.hash = "";
    return { url: u.toString().replace(/\/$/, "").slice(0, 300) };
  }
  if (kind.key === "website") return { error: "website: add the full address, e.g. yoursite.com" };
  const handle = v.replace(/^@/, "");
  if (!/^[\w.-]{2,60}$/.test(handle)) return { error: `${kind.label}: that username doesn't look right` };
  return { url: kind.base + handle };
}

/** What to show for a link: @handle for networks, the host for a website. */
export function linkLabel(key: LinkKey, url: string) {
  try {
    const u = new URL(url);
    if (key === "website") return u.hostname.replace(/^www\./, "") + (u.pathname === "/" ? "" : u.pathname);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
    return key === "linkedin" ? last : `@${last}`;
  } catch {
    return url;
  }
}

export function cleanLinks(links: unknown): Links {
  if (!links || typeof links !== "object") return {};
  const out: Links = {};
  for (const k of LINK_KINDS) {
    const v = (links as Record<string, unknown>)[k.key];
    if (typeof v === "string" && v.startsWith("https://")) out[k.key] = v;
  }
  return out;
}
