import "server-only";
import { cache } from "react";
import { CARD_URL } from "@/lib/env";
import { cleanLinks, LINK_KINDS } from "@/lib/links";
import { createClient } from "@/lib/supabase/server";
import { CARD_FIELDS, type Card } from "@/lib/data";

/** Public visit card by handle (works for signed-out visitors and search engines). */
export const getCardByHandle = cache(async (handle: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select(`${CARD_FIELDS}, cities(name)`)
    .eq("handle", handle.toLowerCase())
    .maybeSingle<Card & { cities: { name: string } | null }>();
  return data;
});

/** The card as llms.txt: H1 «name — role», then the markdown bio. */
export function cardToMarkdown(card: Card & { cities?: { name: string } | null }) {
  const lines = [`# ${card.name ?? "member"} — ${card.role ?? "member of 1handshake"}`, ""];
  if (card.cities?.name) lines.push(`city: ${card.cities.name}`, "");
  if (card.bio_md) lines.push(card.bio_md.trim(), "");
  const links = cleanLinks(card.links);
  const linkLines = LINK_KINDS.filter((k) => links[k.key]).map((k) => `- ${k.label}: ${links[k.key]}`);
  if (linkLines.length) lines.push("## links", ...linkLines, "");
  lines.push(`card: ${CARD_URL}/@${card.handle}`);
  return lines.join("\n");
}
