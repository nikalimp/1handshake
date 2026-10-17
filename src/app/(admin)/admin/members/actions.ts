"use server";
import { revalidatePath } from "next/cache";
import { adminState } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { error: string };

const message = (e: { message: string }) => {
  const m = e.message;
  if (m.includes("admins only")) return "admins only";
  if (m.includes("reason required")) return "write a reason";
  if (m.includes("cannot ban an admin")) return "admins can't be banned here";
  if (m.includes("not yourself")) return "you can't ban yourself";
  if (m.includes("nothing to change")) return "already done";
  if (m.includes("not found")) return "already gone";
  return "couldn't save. try again.";
};

async function admin() {
  const s = await adminState();
  return s.kind === "admin" ? s : null;
}

const done = (): Result => {
  revalidatePath("/admin", "layout");
  return { ok: true };
};

/**
 * Ban or unban. The database changes the status and logs it; the account is also blocked in
 * Supabase Auth so the session stops refreshing (a banned member is out within the hour at most).
 */
export async function setBan(profileId: string, ban: boolean, reason: string): Promise<Result> {
  const s = await admin();
  if (!s) return { error: "admins only" };
  const { error } = await s.supabase.rpc("admin_set_ban", { p_profile: profileId, p_ban: ban, p_reason: reason.trim() || null });
  if (error) return { error: message(error) };
  const service = createAdminClient();
  if (service) {
    // ~100 years; "none" lifts it. The profile status is the source of truth either way.
    await service.auth.admin.updateUserById(profileId, { ban_duration: ban ? "876000h" : "none" }).catch(() => null);
  }
  return done();
}

export async function hidePost(postId: string, reason: string): Promise<Result> {
  const s = await admin();
  if (!s) return { error: "admins only" };
  const { error } = await s.supabase.rpc("admin_hide_post", { p_post: postId, p_reason: reason.trim() || null });
  if (error) return { error: message(error) };
  revalidatePath("/feed");
  return done();
}

export async function closeOffer(offerId: string, reason: string): Promise<Result> {
  const s = await admin();
  if (!s) return { error: "admins only" };
  const { error } = await s.supabase.rpc("admin_close_offer", { p_offer: offerId, p_reason: reason.trim() || null });
  if (error) return { error: message(error) };
  revalidatePath("/feed");
  return done();
}
