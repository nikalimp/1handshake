"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getMe } from "@/lib/data";
import type { OfferKind } from "@/lib/offers";
import { firstName, sendPush } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type OfferInput = { kind: OfferKind; title: string; body_md: string; price: string; link: string };

const KINDS: OfferKind[] = ["order", "project", "product", "service"];

const refresh = (handle: string | null) => {
  revalidatePath("/profile");
  revalidatePath("/feed");
  if (handle) revalidatePath(`/people/${handle}`);
};

/** Create (id null) or edit my offer. */
export async function saveOffer(id: string | null, input: OfferInput): Promise<{ ok: true } | { error: string }> {
  const me = await getMe();
  if (!me) return { error: "members only" };
  const title = input.title.trim().slice(0, 120);
  if (title.length < 3) return { error: "the title needs at least 3 characters" };
  if (!KINDS.includes(input.kind)) return { error: "pick what kind of offer it is" };
  let link = input.link.trim();
  if (link && !/^https?:\/\//.test(link)) link = `https://${link}`;
  link = link.replace(/^http:\/\//, "https://");
  const row = { kind: input.kind, title, body_md: input.body_md.slice(0, 2000), price: input.price.trim().slice(0, 40) || null, link: link.slice(0, 500) || null };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("offers").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id).eq("profile_id", me.id)
    : await supabase.from("offers").insert({ ...row, profile_id: me.id });
  if (error) return { error: error.message.includes("too many") ? "you have 10 open offers — close one first" : "couldn't save the offer. try again." };
  refresh(me.handle);
  return { ok: true };
}

/** Close (done, sold, found someone) or reopen. */
export async function setOfferClosed(id: string, closed: boolean): Promise<{ ok: true } | { error: string }> {
  const me = await getMe();
  if (!me) return { error: "members only" };
  const supabase = await createClient();
  const { error } = await supabase.from("offers").update({ closed_at: closed ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", id).eq("profile_id", me.id);
  if (error) return { error: error.message.includes("too many") ? "you have 10 open offers — close one first" : "couldn't save. try again." };
  refresh(me.handle);
  return { ok: true };
}

export async function deleteOffer(id: string): Promise<{ ok: true } | { error: string }> {
  const me = await getMe();
  if (!me) return { error: "members only" };
  const supabase = await createClient();
  const { error } = await supabase.from("offers").delete().eq("id", id).eq("profile_id", me.id);
  if (error) return { error: "couldn't delete. try again." };
  refresh(me.handle);
  return { ok: true };
}

/** "i'm interested": the author gets a push and sees me on the offer. */
export async function setInterest(offerId: string, interested: boolean): Promise<{ ok: true } | { error: string }> {
  const me = await getMe();
  if (!me) return { error: "members only" };
  const supabase = await createClient();
  const { error } = interested
    ? await supabase.from("offer_interest").insert({ offer_id: offerId, profile_id: me.id })
    : await supabase.from("offer_interest").delete().eq("offer_id", offerId).eq("profile_id", me.id);
  if (error && error.code !== "23505") return { error: "couldn't save. try again." };
  if (interested && !error) {
    after(async () => {
      const admin = createAdminClient();
      if (!admin) return;
      const { data: o } = await admin.from("offers").select("profile_id, title").eq("id", offerId).maybeSingle<{ profile_id: string; title: string }>();
      if (o) await sendPush([o.profile_id], { title: `${firstName(me.name)} is interested 🔥`, body: o.title.slice(0, 100), url: me.handle ? `/people/${me.handle}` : "/profile", tag: `offer-${offerId}-${me.id}` });
    });
  }
  revalidatePath("/feed");
  return { ok: true };
}
