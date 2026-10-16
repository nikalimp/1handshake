// Event helpers that work on both the server and in the browser.
import { SUPABASE_URL } from "@/lib/env";

export type EventRow = {
  id: string;
  slug: string;
  host_id: string;
  title: string;
  body_md: string;
  cover_path: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  online: boolean;
  city_id: number | null;
  venue: string | null;
  address: string | null;
  price: string | null;
  registration_url: string | null;
  source_url: string | null;
  review: "pending" | "approved" | "rejected";
  reviewed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};
// Never "*": the check-in code is not readable by members.
export const EVENT_FIELDS =
  "id, slug, host_id, title, body_md, cover_path, starts_at, ends_at, timezone, online, city_id, venue, address, price, registration_url, source_url, review, reviewed_at, cancelled_at, created_at, updated_at";

/** Covers live in a public bucket: the calendar on the site shows them too. */
export const coverUrl = (path: string | null | undefined) => (path ? `${SUPABASE_URL}/storage/v1/object/public/covers/${path}` : null);

/** An event without an end counts as 8 hours long. */
export const endOf = (e: { starts_at: string; ends_at: string | null }) => new Date(e.ends_at ?? new Date(e.starts_at).getTime() + 8 * 3600_000);
export const isOver = (e: { starts_at: string; ends_at: string | null }, now = Date.now()) => endOf(e).getTime() < now;

const part = (d: Date, tz: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...opts }).format(d).toLowerCase().replace(",", "");

/** "sat 17 oct · 09:00–16:00" in the event's own time zone (the year only when it isn't this year). */
export function formatWhen(e: { starts_at: string; ends_at: string | null; timezone: string }) {
  const tz = e.timezone || "UTC";
  const s = new Date(e.starts_at);
  const yearNow = new Date().getFullYear();
  const dayOpts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", ...(s.getFullYear() !== yearNow ? { year: "numeric" } : {}) };
  const time = (d: Date) => part(d, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const day = (d: Date) => part(d, tz, dayOpts);
  if (!e.ends_at) return `${day(s)} · ${time(s)}`;
  const en = new Date(e.ends_at);
  return day(s) === day(en) ? `${day(s)} · ${time(s)}–${time(en)}` : `${day(s)} ${time(s)} – ${day(en)} ${time(en)}`;
}

/** "Asia/Bangkok" → "bangkok time" */
export const tzLabel = (tz: string) => (tz === "UTC" ? "utc" : `${(tz.split("/").pop() ?? tz).replace(/_/g, " ").toLowerCase()} time`);

/** A moment as the value of <input type="datetime-local"> in the given time zone. */
export function toLocalInput(iso: string | null, tz: string) {
  if (!iso) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** "Bangkok" from a place list, or "online". */
export const whereShort = (e: { online: boolean; venue: string | null }, city?: string | null) =>
  e.online ? "online" : [e.venue, city].filter(Boolean).join(" · ") || "place tba";
