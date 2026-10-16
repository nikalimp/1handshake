export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// "publishable" key in new Supabase projects, "anon" key in older ones — either works here.
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
