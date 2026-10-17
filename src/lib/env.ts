export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// "publishable" key in new Supabase projects, "anon" key in older ones — either works here.
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const trim = (u: string) => u.replace(/\/$/, "");
const host = (u: string) => u.replace(/^https?:\/\//, "");

/** Where the app lives: sign-in, invites, everything behind login. "https://app.1handshake.com" in production. */
export const APP_URL = trim(process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
/**
 * Where public visit cards are linked and indexed: "https://1handshake.com" once the site proxies
 * /@handle to the app (set NEXT_PUBLIC_CARD_URL then). Until that, the app's own address.
 */
export const CARD_URL = trim(process.env.NEXT_PUBLIC_CARD_URL ?? APP_URL);
export const APP_HOST = host(APP_URL);
export const CARD_HOST = host(CARD_URL);

/**
 * The admin panel. "https://admin.1handshake.com" in production (NEXT_PUBLIC_ADMIN_URL): there every path is
 * rewritten to the app's /admin routes. Without it (localhost, previews) the panel lives at the app's /admin.
 */
export const ADMIN_URL = trim(process.env.NEXT_PUBLIC_ADMIN_URL ?? `${APP_URL}/admin`);
export const ADMIN_HOST = host(ADMIN_URL).split("/")[0];
/** True when the panel has its own domain, separate from the app's. */
export const ADMIN_ON_OWN_HOST = Boolean(process.env.NEXT_PUBLIC_ADMIN_URL) && ADMIN_HOST !== APP_HOST;

/** The main site: landing, Terms of Service, Privacy Policy. */
export const MAIN_URL = trim(process.env.NEXT_PUBLIC_MAIN_URL ?? "https://1handshake.com");
export const TERMS_URL = `${MAIN_URL}/terms`;
export const PRIVACY_URL = `${MAIN_URL}/privacy`;

/** @deprecated kept for older imports: the app's address. */
export const SITE_URL = APP_URL;
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

/**
 * The origin a request came in on, for redirects after sign-in and sign-out. The admin domain is recognised
 * from the Host header (Vercel only routes hosts it serves); anything else keeps the URL's own origin.
 */
export function requestOrigin(request: { headers: Headers; nextUrl: { origin: string } }) {
  const h = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0].trim();
  return ADMIN_ON_OWN_HOST && h === ADMIN_HOST ? new URL(ADMIN_URL).origin : request.nextUrl.origin;
}
