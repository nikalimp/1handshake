import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckinQr } from "@/components/event-controls";
import { requireMe } from "@/lib/data";
import { APP_URL } from "@/lib/env";
import { EVENT_FIELDS, type EventRow, formatWhen } from "@/lib/event-format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "check-in qr", robots: { index: false } };

// The host shows this at the entrance (or prints it). Guests scan it with their camera.
export default async function CheckinQrPage(props: PageProps<"/events/[slug]/qr">) {
  const { slug } = await props.params;
  await requireMe();
  const supabase = await createClient();
  const { data: ev } = await supabase.from("events").select(EVENT_FIELDS).eq("slug", slug).maybeSingle<EventRow>();
  if (!ev) notFound();
  const [{ data: code }, { count }] = await Promise.all([
    supabase.rpc("event_checkin_code", { p_event: ev.id }),
    supabase.from("event_people").select("user_id", { count: "exact", head: true }).eq("event_id", ev.id).not("checked_in_at", "is", null),
  ]);
  if (!code) notFound();
  return (
    <main className="flex flex-col items-center gap-5 pt-4 text-center">
      <Link href={`/events/${ev.slug}`} className="meta self-start hover:text-ink print:hidden">
        ← back
      </Link>
      <div>
        <p className="meta">scan to check in · join 1handshake</p>
        <h1 className="mt-1 text-[26px] leading-[30px] font-extrabold tracking-[-0.03em]">{ev.title}</h1>
        <p className="meta mt-1">{formatWhen(ev)}</p>
      </div>
      <CheckinQr eventId={ev.id} appUrl={APP_URL} code={code as string} />
      <p className="text-lg font-extrabold">🎟 {count ?? 0} checked in</p>
      <p className="meta max-w-xs print:hidden">works from 3 hours before the start until 3 hours after the end. if a photo of it leaks, make a new code.</p>
    </main>
  );
}
