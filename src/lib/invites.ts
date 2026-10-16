import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type OpenedInvite = {
  status: "live" | "scanned" | "joined" | "expired" | "cancelled";
  inviter_name: string | null;
  inviter_handle: string | null;
  selfie_path: string | null;
  expires_at: string;
};

/** Opens a code (marks it scanned on first open). Null when the code doesn't exist. */
export async function openInvite(code: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("open_invite", { p_code: code });
  return (data as OpenedInvite[] | null)?.[0] ?? null;
}

/** Signed URL for the joint selfie. Needs SUPABASE_SERVICE_ROLE_KEY: the guest isn't a member yet. */
export async function selfieUrl(path: string | null) {
  if (!path) return null;
  const admin = createAdminClient();
  const signed = await admin?.storage.from("selfies").createSignedUrl(path, 60 * 30);
  return signed?.data?.signedUrl ?? null;
}

export function inviteProblem(inv: OpenedInvite | null) {
  if (!inv) return "this code doesn't exist";
  if (inv.status === "joined") return "this code was already used";
  if (inv.status === "cancelled") return "this code was cancelled";
  if (inv.status === "expired" || new Date(inv.expires_at).getTime() < Date.now()) return "this code expired";
  return null;
}
