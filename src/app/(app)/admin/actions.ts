"use server";
import { revalidatePath } from "next/cache";
import { getMe } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

// Admin decision on a reported handshake. The database checks the caller is an admin.
export async function resolveHandshake(inviteId: string, cancel: boolean): Promise<{ ok: true } | { error: string }> {
  const me = await getMe();
  if (!me) return { error: "members only" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_resolve_handshake", { p_invite: inviteId, p_cancel: cancel });
  if (error) return { error: error.message.includes("admins only") ? "admins only" : "couldn't save. try again." };
  revalidatePath("/admin");
  revalidatePath("/feed");
  revalidatePath("/graph");
  return { ok: true };
}
