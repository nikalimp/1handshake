import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type PublicEvent = {
  id: string;
  slug: string;
  title: string;
  body_md: string;
  cover_path: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  online: boolean;
  venue: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  price: string | null;
  registration_url: string | null;
  cancelled: boolean;
  going: number;
  here: number;
  host_name: string | null;
  host_handle: string | null;
  updated_at: string;
};

/** Approved events for the calendar (the site) and the public event page. */
export async function publicEvents(opts: { from?: string | null; to?: string | null; slug?: string | null; limit?: number } = {}) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("events_public", { p_from: opts.from ?? null, p_to: opts.to ?? null, p_slug: opts.slug ?? null, p_limit: opts.limit ?? 200 });
  return (data ?? []) as PublicEvent[];
}

export const publicEvent = cache(async (slug: string) => (await publicEvents({ slug }))[0] ?? null);
