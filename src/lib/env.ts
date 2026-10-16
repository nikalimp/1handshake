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

/** The main site: landing, Terms of Service, Privacy Policy. */
export const MAIN_URL = trim(process.env.NEXT_PUBLIC_MAIN_URL ?? "https://1handshake.com");
export const TERMS_URL = `${MAIN_URL}/terms`;
export const PRIVACY_URL = `${MAIN_URL}/privacy`;

/** @deprecated kept for older imports: the app's address. */
export const SITE_URL = APP_URL;
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
