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
