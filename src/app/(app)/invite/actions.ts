"use server";
import { getMe } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

/**
 * Removes my selfies that no code uses anymore: retakes and cancelled or expired codes.
 * Selfies of live, scanned and joined codes stay (joined ones are the handshake posts).
 */
export async function tidySelfies() {
  const me = await getMe();
  if (!me) return;
  const supabase = await createClient();
  const [{ data: files }, { data: kept }] = await Promise.all([
    supabase.storage.from("selfies").list(me.id, { limit: 1000 }),
    supabase.from("invites").select("selfie_path, status, expires_at").eq("inviter_id", me.id).in("status", ["live", "scanned", "joined"]),
  ]);
  const now = Date.now();
  const keep = new Set(
    (kept ?? [])
      .filter((i) => i.status !== "live" || new Date(i.expires_at).getTime() > now)
      .map((i) => i.selfie_path)
      .filter(Boolean),
  );
  const stale = (files ?? []).map((f) => `${me.id}/${f.name}`).filter((p) => !keep.has(p));
  if (stale.length) await supabase.storage.from("selfies").remove(stale);
}
