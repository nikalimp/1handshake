import { NextResponse, type NextRequest } from "next/server";
import { APP_URL, CARD_URL } from "@/lib/env";
import { coverUrl } from "@/lib/event-format";
import { publicEvents } from "@/lib/events-public";

// The club calendar for the site (1handshake.com/events): approved events, soonest first.
// GET /api/events?from=2026-10-01&to=2026-11-01&city=bangkok&country=thailand
// Without "from": everything that hasn't ended yet. Open to any origin.
const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS" };

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const date = (v: string | null) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
  const city = q.get("city")?.trim().toLowerCase() ?? "";
  const country = q.get("country")?.trim().toLowerCase() ?? "";
  const rows = await publicEvents({ from: date(q.get("from")), to: date(q.get("to")), limit: Math.min(Number(q.get("limit")) || 200, 500) });
  const events = rows
    .filter((e) => (!city || (e.city ?? "").toLowerCase() === city || (city === "online" && e.online)) && (!country || (e.country ?? "").toLowerCase() === country))
    .map((e) => ({
      slug: e.slug,
      title: e.title,
      description_md: e.body_md,
      cover_url: coverUrl(e.cover_path),
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      timezone: e.timezone,
      online: e.online,
      venue: e.venue,
      address: e.address,
      city: e.city,
      country: e.country,
      price: e.price,
      registration_url: e.registration_url,
      cancelled: e.cancelled,
      going: e.going,
      checked_in: e.here,
      host: e.host_handle ? { name: e.host_name, handle: e.host_handle, url: `${CARD_URL}/@${e.host_handle}` } : null,
      url: `${CARD_URL}/e/${e.slug}`,
      app_url: `${APP_URL}/events/${e.slug}`,
    }));
  // Places to filter by, from the events themselves.
  const places = [...new Map(rows.filter((e) => e.city).map((e) => [`${e.city}|${e.country}`, { city: e.city, country: e.country }])).values()];
  return NextResponse.json({ events, places, online: rows.some((e) => e.online) }, { headers: { ...cors, "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
