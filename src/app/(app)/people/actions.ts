"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getMe } from "@/lib/data";
import { firstName, sendPush } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";

// Wall actions. The database decides who may do what (RLS): you write on your own wall or a
// connection's wall, fire anyone's post, and remove posts you wrote or that sit on your wall.

export async function postToWall(ownerId: string, body: string): Promise<{ ok: true } | { error: string }> {
  const me = await getMe();
  if (!me) return { error: "members only" };
  const text = body.trim();
  if (!text) return { error: "write something first" };
  if (text.length > 2000) return { error: "keep it under 2000 characters" };
  const supabase = await createClient();
  const { error } = await supabase.from("wall_posts").insert({ wall_owner_id: ownerId, author_id: me.id, body: text });
  if (error) return { error: error.message.includes("row-level security") ? "only connections can write here" : "couldn't post. try again." };
  if (ownerId !== me.id) {
    after(() => sendPush([ownerId], { title: `${firstName(me.name)} wrote on your wall`, body: text.slice(0, 120), url: "/profile", tag: `wall-${me.id}` }));
  }
  revalidatePath("/profile");
  revalidatePath("/people/[handle]", "page");
  return { ok: true };
}

export async function toggleFire(postId: string, on: boolean) {
  const me = await getMe();
  if (!me) return;
  const supabase = await createClient();
  if (on) await supabase.from("post_fires").insert({ post_id: postId, profile_id: me.id });
  else await supabase.from("post_fires").delete().eq("post_id", postId).eq("profile_id", me.id);
}

export async function removePost(postId: string) {
  const me = await getMe();
  if (!me) return;
  const supabase = await createClient();
  await supabase.from("wall_posts").update({ deleted_at: new Date().toISOString() }).eq("id", postId);
  revalidatePath("/profile");
  revalidatePath("/people/[handle]", "page");
}

// Moderation. A member flags a handshake selfie that looks fake; at 3 reports from different
// people the selfie hides and the handshake waits for an admin. Parties can't report their own.
export async function reportHandshake(inviteId: string): Promise<{ ok: true; reports: number } | { error: string }> {
  const me = await getMe();
  if (!me) return { error: "members only" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_handshake", { p_invite: inviteId });
  if (error) return { error: "couldn't send the report. try again." };
  return { ok: true, reports: Number(data) };
}

// Either of the two people can remove their connection.
export async function removeConnection(otherId: string) {
  const me = await getMe();
  if (!me) return;
  const supabase = await createClient();
  await supabase.rpc("remove_connection", { p_other: otherId });
  revalidatePath("/profile");
  revalidatePath("/people/[handle]", "page");
  revalidatePath("/graph");
  revalidatePath("/feed");
}
