import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Signed URLs for private files, in one request per bucket. Uses the caller's client, so storage
 * policies apply: signed-in users can read selfies and avatars; pass the admin client for visitors.
 */
export async function signedUrls(client: SupabaseClient | null, bucket: "avatars" | "selfies", paths: (string | null | undefined)[], ttl = 60 * 60) {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const map = new Map<string, string>();
  if (!client || unique.length === 0) return map;
  const { data } = await client.storage.from(bucket).createSignedUrls(unique, ttl);
  for (const row of data ?? []) if (row.path && row.signedUrl) map.set(row.path, row.signedUrl);
  return map;
}
