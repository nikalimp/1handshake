"use server";
import { getMe } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

type Sub = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

/** Remember this browser for notifications (the device belongs to whoever signed in on it last). */
export async function savePushSubscription(sub: Sub): Promise<{ ok: true } | { error: string }> {
  const me = await getMe();
  if (!me) return { error: "members only" };
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "bad subscription" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_push_subscription", { p_endpoint: sub.endpoint, p_p256dh: sub.keys.p256dh, p_auth: sub.keys.auth });
  return error ? { error: "couldn't turn on notifications" } : { ok: true };
}

export async function dropPushSubscription(endpoint: string) {
  const me = await getMe();
  if (!me) return;
  const supabase = await createClient();
  await supabase.rpc("drop_push_subscription", { p_endpoint: endpoint });
}
