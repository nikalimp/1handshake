"use server";
import { revalidatePath } from "next/cache";
import { getMe } from "@/lib/data";
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
