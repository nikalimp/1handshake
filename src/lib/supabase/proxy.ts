import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { ADMIN_HOST, ADMIN_ON_OWN_HOST, ADMIN_URL, APP_HOST, SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/env";

// /admin is not here: the panel shows its own sign-in screen.
const MEMBER_AREA = ["/connect", "/feed", "/graph", "/profile", "/invite", "/people", "/events"];
// App screens that never open on the admin domain. /events, /offers and /graph are not here: the panel has its own.
const APP_ONLY = ["/connect", "/feed", "/profile", "/invite", "/people", "/i", "/in", "/u", "/ev", "/e"];
// Paths that work the same on the admin domain: sign-in round trip, APIs, Next internals.
const SHARED = ["/auth/", "/api/", "/_next/", "/favicon.ico"];
// Once a day per device we mark the member as active (DAU / WAU / MAU, retention).
const SEEN_COOKIE = "hs_seen";

const requestHost = (request: NextRequest) => (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0].trim();

/**
 * Admin domain: admin.1handshake.com/members is served by the app's /admin/members.
 * App domain: the old /admin moves to the admin domain for good.
 * Returns a redirect, a rewritten URL to serve, or null for an ordinary app request.
 */
function adminRouting(request: NextRequest): { redirect: URL } | { rewrite: URL } | null {
  if (!ADMIN_ON_OWN_HOST) return null;
  const { pathname, search } = request.nextUrl;
  const host = requestHost(request);

  if (host === ADMIN_HOST) {
    if (SHARED.some((p) => pathname.startsWith(p))) return null;
    // Old links with the /admin prefix → the clean address.
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      return { redirect: new URL(`${ADMIN_URL}${pathname.slice("/admin".length) || "/"}${search}`) };
    }
    // App screens don't open on the admin domain.
    if (APP_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`)) || pathname.startsWith("/@")) {
      return { redirect: new URL(ADMIN_URL) };
    }
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/admin" : `/admin${pathname}`;
    return { rewrite: url };
  }

  if (host === APP_HOST && (pathname === "/admin" || pathname.startsWith("/admin/"))) {
    return { redirect: new URL(`${ADMIN_URL}${pathname.slice("/admin".length)}${search}`) };
  }
  return null;
}

// Refreshes the Supabase session cookie on every request and keeps signed-out visitors
// out of the member area. Real authorization happens again in pages, actions and the database.
export async function updateSession(request: NextRequest) {
  const routing = adminRouting(request);
  if (routing && "redirect" in routing) return NextResponse.redirect(routing.redirect, 308);
  const onAdminHost = Boolean(routing && "rewrite" in routing);
  const next = () => (routing && "rewrite" in routing ? NextResponse.rewrite(routing.rewrite, { request }) : NextResponse.next({ request }));

  let response = next();
  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = next();
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not put code between createServerClient and getClaims(): it refreshes the session.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  // On the admin domain the panel shows its own sign-in screen instead of redirecting.
  if (onAdminHost) return response;

  const memberArea = MEMBER_AREA.some((p) => request.nextUrl.pathname.startsWith(p));
  if (memberArea && !signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Activity: one row per member per day. A cookie keeps it to one database call a day per device.
  const today = new Date().toISOString().slice(0, 10);
  const inPanel = request.nextUrl.pathname === "/admin" || request.nextUrl.pathname.startsWith("/admin/");
  if (signedIn && !inPanel && request.method === "GET" && request.cookies.get(SEEN_COOKIE)?.value !== today) {
    const { error } = await supabase.rpc("touch_activity");
    if (!error) response.cookies.set(SEEN_COOKIE, today, { maxAge: 60 * 60 * 36, httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/" });
  }
  return response;
}
