import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Card = {
  id: string;
  handle: string | null;
  name: string | null;
  role: string | null;
  bio_md: string;
  avatar_path: string | null;
  city_id: number | null;
  open_to_hiring: boolean;
  open_to_network: boolean;
  status: "active" | "ghost" | "banned";
};
export const CARD_FIELDS = "id, handle, name, role, bio_md, avatar_path, city_id, open_to_hiring, open_to_network, status";

/** Current member, or null when signed out / signed in without a profile (not invited). */
export const getMe = cache(async () => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return null;
  const { data } = await supabase.from("profiles").select(CARD_FIELDS).eq("id", uid).maybeSingle<Card>();
  return data && data.status === "active" ? data : null;
});

/** For member-only pages: the member, or a redirect to the landing page. */
export async function requireMe() {
  const me = await getMe();
  if (!me) redirect("/?error=members-only");
  return me;
}

