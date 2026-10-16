import Link from "next/link";
import { buttonClass } from "@/components/button";
import { ScreenTitle } from "@/components/screen-title";
import { requireMe } from "@/lib/data";
import { coverUrl, EVENT_FIELDS, type EventRow, formatWhen, isOver, whereShort } from "@/lib/event-format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "events" };

// the list shows events from the last two months on
const since = () => new Date(Date.now() - 60 * 24 * 3600_000).toISOString();

export default async function EventsPage() {
  const me = await requireMe();
  const supabase = await createClient();
  const { data } = await supabase.from("events").select(EVENT_FIELDS).gte("starts_at", since()).order("starts_at").limit(200).returns<EventRow[]>();
  const events = (data ?? []).filter((e) => e.review !== "rejected" || e.host_id === me.id);
  const ids = events.map((e) => e.id);
  const cityIds = [...new Set(events.map((e) => e.city_id).filter((c): c is number => c !== null))];
  const [{ data: people }, { data: cities }] = await Promise.all([
    ids.length ? supabase.from("event_people").select("event_id, user_id, going_at, checked_in_at").in("event_id", ids).returns<{ event_id: string; user_id: string; going_at: string | null; checked_in_at: string | null }[]>() : Promise.resolve({ data: [] }),
    cityIds.length ? supabase.from("cities").select("id, name").in("id", cityIds).returns<{ id: number; name: string }[]>() : Promise.resolve({ data: [] }),
  ]);
  const cityName = new Map((cities ?? []).map((c) => [c.id, c.name]));
  const count = (id: string) => (people ?? []).filter((p) => p.event_id === id && (p.going_at || p.checked_in_at)).length;
  const mine = (id: string) => (people ?? []).find((p) => p.event_id === id && p.user_id === me.id);
  const upcoming = events.filter((e) => !isOver(e));
  const past = events.filter((e) => isOver(e)).reverse().slice(0, 10);

  const item = (e: EventRow) => {
    const m = mine(e.id);
    const cover = coverUrl(e.cover_path);
    return (
      <li key={e.id}>
        <Link href={`/events/${e.slug}`} className="flex gap-4 rounded-[var(--radius-lg)] bg-surface p-3 shadow-[var(--shadow-card)]">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="h-[84px] w-[84px] shrink-0 rounded-[var(--radius-md)] object-cover" />
          ) : (
            <span className="grid h-[84px] w-[84px] shrink-0 place-items-center rounded-[var(--radius-md)] bg-surface-sunk text-3xl">🎟</span>
          )}
          <span className="flex min-w-0 flex-col justify-center gap-0.5">
            <span className="meta">{formatWhen(e)}</span>
            <span className="line-clamp-2 leading-5 font-extrabold">{e.title}</span>
            <span className="truncate text-sm text-ink-muted">{whereShort(e, e.city_id ? cityName.get(e.city_id) : null)}</span>
            <span className="meta">
              {e.cancelled_at ? "cancelled" : e.review === "pending" ? "⏳ waiting for approval" : e.review === "rejected" ? "not approved" : m?.checked_in_at ? "✓ you checked in" : m?.going_at ? "🙋 you're going" : `🙋 ${count(e.id)} going`}
            </span>
          </span>
        </Link>
      </li>
    );
  };

  return (
    <>
      <ScreenTitle title="events">
        <Link href="/events/new" className={buttonClass("primary", "sm")}>
          + host event
        </Link>
      </ScreenTitle>
      <p className="meta -mt-2 mb-4 px-0.5">check in with the host&apos;s qr and meet everyone who came</p>
      <ul className="flex flex-col gap-3">{upcoming.map(item)}</ul>
      {upcoming.length === 0 && (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-ink-muted">no events coming up. host one — breakfast, a talk, a walk. everyone who checks in can connect with everyone who came.</p>
          <Link href="/events/new" className={buttonClass("primary")}>
            + host event
          </Link>
        </div>
      )}
      {past.length > 0 && (
        <section className="mt-8 flex flex-col gap-3" aria-label="past events">
          <h2 className="px-0.5 text-[22px] leading-7 font-extrabold tracking-[-0.02em]">past</h2>
          <ul className="flex flex-col gap-3 opacity-80">{past.map(item)}</ul>
        </section>
      )}
    </>
  );
}
