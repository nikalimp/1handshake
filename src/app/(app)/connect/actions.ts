"use server";
import { revalidatePath } from "next/cache";
import { getMe } from "@/lib/data";
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
  const { error } = await supabase.rpc("request_intro", { p_to: personId });
  if (error) {
    if (error.code === "23505") return { ok: true }; // already requested
    if (error.message.includes("one handshake away")) return { error: "they're not one handshake away anymore" };
    return { error: "couldn't send the request. try again." };
  }
  revalidatePath("/connect");
  revalidatePath("/feed");
  return { ok: true };
}
