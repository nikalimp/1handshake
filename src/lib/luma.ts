import "server-only";
import { toLocalInput } from "@/lib/event-format";

// Import an event from its Luma page. Luma has no free API, but the page carries the event as JSON
// (__NEXT_DATA__); when that's missing, the Open Graph tags still give a title, a description and a cover.

export type ImportedEvent = {
  title: string;
  body_md: string;
  starts_local: string;
  ends_local: string;
  timezone: string;
  online: boolean;
  venue: string;
  address: string;
  price: string;
  registration_url: string;
  source_url: string;
  cover_remote: string | null;
  lat: number | null;
  lng: number | null;
};

const HOSTS = new Set(["luma.com", "lu.ma", "www.luma.com", "www.lu.ma"]);

/** A clean luma link, or null when it isn't one. */
export function lumaUrl(raw: string) {
  try {
    const u = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
    if (!HOSTS.has(u.hostname) || u.pathname.length < 2) return null;
    return `https://luma.com${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return null;
  }
}

type PmNode = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: PmNode[] };

/** Luma's rich text (ProseMirror JSON) → markdown. */
export function proseToMarkdown(node: PmNode | null | undefined): string {
  if (!node) return "";
  const inline = (nodes: PmNode[] = []): string =>
    nodes
      .map((n) => {
        if (n.type === "hard_break" || n.type === "hardBreak") return "\n";
        if (n.type !== "text") return inline(n.content);
        let t = n.text ?? "";
        const lead = t.match(/^\s*/)?.[0] ?? "";
        const trail = t.match(/\s*$/)?.[0] ?? "";
        let core = t.trim();
        if (!core) return t;
        for (const m of n.marks ?? []) {
          if (m.type === "bold" || m.type === "strong") core = `**${core}**`;
          else if (m.type === "italic" || m.type === "em") core = `*${core}*`;
          else if (m.type === "code") core = `\`${core}\``;
          else if (m.type === "link" && typeof m.attrs?.href === "string") core = `[${core}](${m.attrs.href})`;
        }
        t = lead + core + trail;
        return t;
      })
      .join("");
  const block = (n: PmNode): string => {
    switch (n.type) {
      case "doc":
        return (n.content ?? []).map(block).filter((b) => b.trim()).join("\n\n");
      case "paragraph":
        return inline(n.content).trim();
      case "heading":
        return `${Number(n.attrs?.level ?? 2) <= 2 ? "##" : "###"} ${inline(n.content).trim()}`;
      case "bullet_list":
      case "bulletList":
        return (n.content ?? []).map((li) => `- ${(li.content ?? []).map(block).join("\n  ")}`).join("\n");
      case "ordered_list":
      case "orderedList":
        return (n.content ?? []).map((li, i) => `${i + 1}. ${(li.content ?? []).map(block).join("\n   ")}`).join("\n");
      case "blockquote":
        return (n.content ?? []).map(block).join("\n\n").split("\n").map((l) => `> ${l}`).join("\n");
      case "horizontal_rule":
      case "horizontalRule":
        return "---";
      default:
        return n.content ? (n.content ?? []).map(block).join("\n\n") : inline([n]);
    }
  };
  return block(node).replace(/\n{3,}/g, "\n\n").trim();
}

const meta = (html: string, prop: string) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]*content="([^"]*)"`, "i")) ?? html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]*(?:property|name)="${prop}"`, "i"));
  return m ? m[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : "";
};

type LumaEvent = {
  name?: string;
  start_at?: string;
  end_at?: string;
  timezone?: string;
  location_type?: string;
  cover_url?: string;
  coordinate?: { latitude?: number; longitude?: number } | null;
  geo_address_info?: { address?: string; full_address?: string; city?: string | null; city_state?: string } | null;
};
type LumaData = {
  event?: LumaEvent;
  description_mirror?: PmNode;
  ticket_info?: { is_free?: boolean; price?: { cents?: number; currency?: string } | null } | null;
};

export async function importFromLuma(raw: string): Promise<ImportedEvent | { error: string }> {
  const url = lumaUrl(raw);
  if (!url) return { error: "paste a luma.com link" };
  let html: string;
  try {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; 1handshake/1.0; +https://1handshake.com)", accept: "text/html" }, signal: AbortSignal.timeout(10_000), redirect: "follow" });
    if (!res.ok) return { error: "luma didn't open this page" };
    html = (await res.text()).slice(0, 3_000_000);
  } catch {
    return { error: "couldn't reach luma. fill it in by hand." };
  }

  let data: LumaData | null = null;
  const next = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (next) {
    try {
      data = (JSON.parse(next[1]) as { props?: { pageProps?: { initialData?: { data?: LumaData } } } }).props?.pageProps?.initialData?.data ?? null;
    } catch {
      data = null;
    }
  }
  const ev = data?.event;
  const tz = ev?.timezone || "UTC";
  const geo = ev?.geo_address_info;
  const ticket = data?.ticket_info;
  const price = ticket?.is_free ? "free" : ticket?.price?.cents ? `${(ticket.price.cents / 100).toLocaleString("en")} ${(ticket.price.currency ?? "").toUpperCase()}`.trim() : "";
  const title = ev?.name || meta(html, "og:title").replace(/\s*·\s*Luma$/i, "");
  if (!title) return { error: "no event on this page" };
  const fullAddress = geo?.full_address ?? "";
  const venue = geo?.address ?? "";
  return {
    title: title.slice(0, 120),
    body_md: (proseToMarkdown(data?.description_mirror) || meta(html, "og:description")).slice(0, 8000),
    starts_local: ev?.start_at ? toLocalInput(ev.start_at, tz) : "",
    ends_local: ev?.end_at ? toLocalInput(ev.end_at, tz) : "",
    timezone: tz,
    online: ev?.location_type === "online",
    venue: venue.slice(0, 120),
    // the full address repeats the venue's name first
    address: (fullAddress.startsWith(`${venue}, `) ? fullAddress.slice(venue.length + 2) : fullAddress).slice(0, 300),
    price,
    registration_url: url,
    source_url: url,
    cover_remote: ev?.cover_url || meta(html, "og:image") || null,
    lat: ev?.coordinate?.latitude ?? null,
    lng: ev?.coordinate?.longitude ?? null,
  };
}

/** Downloads a cover from Luma's image CDN (resized to a square on their side when possible). */
export async function downloadCover(remote: string): Promise<{ bytes: ArrayBuffer; type: string } | null> {
  let u: URL;
  try {
    u = new URL(remote);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !/(^|\.)lumacdn\.com$|(^|\.)lu\.ma$|(^|\.)luma\.com$/.test(u.hostname)) return null;
  const sized = u.hostname === "images.lumacdn.com" && !u.pathname.startsWith("/cdn-cgi/") ? `https://images.lumacdn.com/cdn-cgi/image/format=jpeg,fit=cover,width=1200,height=1200,quality=82${u.pathname}` : null;
  for (const src of [sized, remote].filter((x): x is string => Boolean(x))) {
    try {
      const res = await fetch(src, { signal: AbortSignal.timeout(10_000) });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !/^image\/(jpeg|png|webp|gif)/.test(type)) continue;
      const bytes = await res.arrayBuffer();
      if (bytes.byteLength > 6_000_000) continue;
      return { bytes, type: type.split(";")[0] };
    } catch {
      continue;
    }
  }
  return null;
}
