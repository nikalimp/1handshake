import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ADMIN_HOST, ADMIN_ON_OWN_HOST } from "@/lib/env";
import { getMe } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

/**
 * Where the panel's links start: "" on admin.1handshake.com (every path is the panel),
 * "/admin" on localhost and previews, where the panel is a section of the app.
 */
export const adminBase = cache(async () => {
  if (!ADMIN_ON_OWN_HOST) return "/admin";
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  return host === ADMIN_HOST ? "" : "/admin";
});

/** Who is looking at the panel: signed out, a member who isn't an admin, or an admin. */
export const adminState = cache(async () => {
  const me = await getMe();
  if (!me) return { kind: "signed-out" as const };
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_admin");
  if (data !== true) return { kind: "not-admin" as const, me };
  return { kind: "admin" as const, me, supabase };
});

/** For admin pages and actions: the admin's client, or 404. The database checks is_admin() again. */
export async function requireAdmin() {
  const s = await adminState();
  if (s.kind !== "admin") notFound();
  return s;
}

/** Period chips on the overview and in exports. */
export const PERIODS = [
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
  { key: "all", label: "all time", days: null },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"];

export function periodRange(key: string | undefined) {
  const p = PERIODS.find((x) => x.key === key) ?? PERIODS[1];
  const to = new Date();
  const from = p.days ? new Date(to.getTime() - p.days * 86_400_000) : null;
  return { period: p, from: from?.toISOString() ?? null, to: to.toISOString() };
}
