"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getMe } from "@/lib/data";
import { firstName, sendPush } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Hide someone from connect. Reversible with unskip. */
export async function skipPerson(personId: string) {
  const me = await getMe();
  if (!me) return;
  const supabase = await createClient();
  await supabase.from("hidden").insert({ profile_id: me.id, hidden_id: personId });
}

export async function unskipPerson(personId: string) {
  const me = await getMe();
  if (!me) return;
  const supabase = await createClient();
  await supabase.from("hidden").delete().eq("profile_id", me.id).eq("hidden_id", personId);
}

/** Ask for an intro. Every mutual connection is asked to back it with a 🔥. */
export async function requestIntro(personId: string): Promise<{ ok: true } | { error: string }> {
  const me = await getMe();
  if (!me) return { error: "members only" };
  const supabase = await createClient();
  const { data: req, error } = await supabase.rpc("request_intro", { p_to: personId });
  if (error) {
    if (error.code === "23505") return { ok: true }; // already requested
    if (error.message.includes("one handshake away")) return { error: "they're not one handshake away anymore" };
    return { error: "couldn't send the request. try again." };
  }
  const requestId = (req as { id?: string } | null)?.id;
  after(async () => {
    const admin = createAdminClient();
    if (!admin) return;
    const { data: to } = await admin.from("profiles").select("name").eq("id", personId).maybeSingle<{ name: string | null }>();
    await sendPush([personId], { title: `${firstName(me.name)} wants to meet you`, body: `${me.role ?? "a member"} · open your feed to answer`, url: "/feed", tag: `req-${requestId}` });
    if (requestId) {
      const { data: mutuals } = await admin.from("request_mutuals").select("mutual_id").eq("request_id", requestId).returns<{ mutual_id: string }[]>();
      await sendPush((mutuals ?? []).map((m) => m.mutual_id), { title: "back an intro 🔥", body: `${firstName(me.name)} wants to meet ${firstName(to?.name)} through you`, url: "/feed", tag: `back-${requestId}` });
    }
  });
  revalidatePath("/connect");
  revalidatePath("/feed");
  return { ok: true };
}

/** Connect with someone from the same event: no mutuals needed. If they tapped connect too, you're connected now. */
export async function requestEventConnect(personId: string, eventId: string): Promise<{ state: "requested" | "connected" } | { error: string }> {
  const me = await getMe();
  if (!me) return { error: "members only" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_event_connect", { p_to: personId, p_event: eventId });
  if (error) return { error: error.message.includes("not at this event") ? "you weren't checked in at this event together" : "couldn't connect. try again." };
  const state = data === "connected" ? "connected" : "requested";
  after(async () => {
    const admin = createAdminClient();
    if (!admin) return;
    const { data: ev } = await admin.from("events").select("title").eq("id", eventId).maybeSingle<{ title: string }>();
    await sendPush(
      [personId],
      state === "connected"
        ? { title: `you and ${firstName(me.name)} are connected 🎟`, body: `met at ${ev?.title ?? "the event"}`, url: me.handle ? `/people/${me.handle}` : "/feed", tag: `ev-${personId}-${me.id}` }
        : { title: `${firstName(me.name)} wants to connect`, body: `you were both at ${ev?.title ?? "the event"} · open your feed to answer`, url: "/feed", tag: `ev-${me.id}-${personId}` },
    );
  });
  revalidatePath("/connect");
  revalidatePath("/feed");
  revalidatePath("/graph");
  return { state };
}
