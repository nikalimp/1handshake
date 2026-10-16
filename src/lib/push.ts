import "server-only";
import webpush from "web-push";
import { VAPID_PUBLIC_KEY } from "@/lib/push-public";
import { createAdminClient } from "@/lib/supabase/admin";

export type PushMessage = { title: string; body: string; url: string; tag?: string };

/**
 * Browser notifications to members' devices. Quietly does nothing until VAPID_PRIVATE_KEY is set.
 * Dead subscriptions (the browser dropped them) are removed.
 */
export async function sendPush(profileIds: string[], msg: PushMessage) {
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const admin = createAdminClient();
  const ids = [...new Set(profileIds)].filter(Boolean);
  if (!privateKey || !admin || !ids.length) return;
  webpush.setVapidDetails("mailto:hello@1handshake.com", VAPID_PUBLIC_KEY, privateKey);
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").in("profile_id", ids);
  const payload = JSON.stringify(msg);
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
    }),
  );
}

export const firstName = (name: string | null | undefined) => (name ?? "a member").split(" ")[0];
