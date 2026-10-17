import "server-only";
import { cache } from "react";
import { CARD_URL } from "@/lib/env";
import { cleanLinks, LINK_KINDS } from "@/lib/links";
import { createClient } from "@/lib/supabase/server";
import { CARD_FIELDS, type Card } from "@/lib/data";
import { kindLabel, OFFER_FIELDS, type Offer } from "@/lib/offers";

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

/** A member's open offers — public, like the card. */
export const getOpenOffers = cache(async (profileId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("offers").select(OFFER_FIELDS).eq("profile_id", profileId).is("closed_at", null).order("created_at", { ascending: false }).returns<Offer[]>();
  return data ?? [];
});

/** The card as llms.txt: H1 «name — role», then the markdown bio and open offers. */
export function cardToMarkdown(card: Card & { cities?: { name: string } | null }, offers: Offer[] = []) {
  const lines = [`# ${card.name ?? "member"} — ${card.role ?? "member of 1handshake"}`, ""];
  if (card.cities?.name) lines.push(`city: ${card.cities.name}`, "");
  if (card.bio_md) lines.push(card.bio_md.trim(), "");
  const links = cleanLinks(card.links);
  const linkLines = LINK_KINDS.filter((k) => links[k.key]).map((k) => `- ${k.label}: ${links[k.key]}`);
  if (linkLines.length) lines.push("## links", ...linkLines, "");
  if (offers.length) {
    lines.push("## offers");
    for (const o of offers) lines.push(`- ${kindLabel(o.kind)}: ${o.title}${o.price ? ` (${o.price})` : ""}${o.link ? ` — ${o.link}` : ""}`);
    lines.push("");
  }
  lines.push(`card: ${CARD_URL}/@${card.handle}`);
  return lines.join("\n");
}
