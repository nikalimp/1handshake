"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { adminState } from "@/lib/admin";
import { rebuildSite } from "@/lib/site-hook";

// Admin actions on events, offers and reports. Each RPC checks is_admin() again and writes the admin log.

type Result = { ok: true } | { error: string };

const message = (m: string) => {
  if (m.includes("admins only")) return "admins only";
  if (m.includes("reason required")) return "write a reason";
  if (m.includes("nothing to change")) return "already done";
  if (m.includes("not found")) return "already gone";
  return "couldn't save. try again.";
};

async function run(fn: string, args: Record<string, unknown>, paths: string[] = []): Promise<Result> {
  const s = await adminState();
  if (s.kind !== "admin") return { error: "admins only" };
  const { error } = await s.supabase.rpc(fn, args);
  if (error) return { error: message(error.message) };
  revalidatePath("/admin", "layout");
  for (const p of paths) revalidatePath(p);
  return { ok: true };
}

const r = (reason: string) => reason.trim() || null;

// Events -------------------------------------------------------------------------------------------
export async function reviewEventAdmin(eventId: string, approve: boolean, note: string): Promise<Result> {
  const res = await run("admin_review_event", { p_event: eventId, p_approve: approve, p_note: r(note) }, ["/feed", "/events"]);
  // An approved event goes on the site's public calendar: rebuild the site (no-op without the hook).
  if ("ok" in res && approve) after(() => rebuildSite());
  return res;
}

export async function cancelEventAdmin(eventId: string, reason: string): Promise<Result> {
  const res = await run("admin_cancel_event", { p_event: eventId, p_reason: r(reason) }, ["/feed", "/events"]);
  if ("ok" in res) after(() => rebuildSite());
  return res;
}

export async function newCheckinCodeAdmin(eventId: string): Promise<Result> {
  return run("admin_new_checkin_code", { p_event: eventId });
}

// Offers -------------------------------------------------------------------------------------------
export async function closeOfferAdmin(offerId: string, reason: string): Promise<Result> {
  return run("admin_close_offer", { p_offer: offerId, p_reason: r(reason) }, ["/feed"]);
}

export async function hideOfferAdmin(offerId: string, reason: string): Promise<Result> {
  return run("admin_hide_offer", { p_offer: offerId, p_reason: r(reason) }, ["/feed"]);
}

export async function keepOfferAdmin(offerId: string, reason: string): Promise<Result> {
  return run("admin_unhide_offer", { p_offer: offerId, p_reason: r(reason) }, ["/feed"]);
}

export async function deleteOfferAdmin(offerId: string, reason: string): Promise<Result> {
  return run("admin_delete_offer", { p_offer: offerId, p_reason: r(reason) }, ["/feed"]);
}

// Reports about members ------------------------------------------------------------------------------
export async function dismissMemberReports(profileId: string, reason: string): Promise<Result> {
  return run("admin_resolve_member_reports", { p_profile: profileId, p_reason: r(reason) });
}
