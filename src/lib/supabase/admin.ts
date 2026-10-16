import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";

// Service-role client: bypasses RLS. Server-only, used for signed URLs of private files
// and for deleting the auth user when a member becomes a ghost. Never import in client code.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}
