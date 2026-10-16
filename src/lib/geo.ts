import "server-only";
import { headers } from "next/headers";
import type { City } from "@/components/city-picker";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** A first guess at the visitor's city from their connection (Vercel's IP location). VPNs fool it — it's only a default. */
export async function guessCity(supabase: Supabase): Promise<City | null> {
  const h = await headers();
  const lat = Number(h.get("x-vercel-ip-latitude"));
  const lng = Number(h.get("x-vercel-ip-longitude"));
  if (!h.get("x-vercel-ip-latitude") || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const { data } = await supabase.rpc("nearest_city", { p_lat: lat, p_lng: lng });
  return ((data ?? []) as City[])[0] ?? null;
}
