import { notFound } from "next/navigation";
import type { City } from "@/components/city-picker";
import { EventForm } from "@/components/event-form";
import { ScreenTitle } from "@/components/screen-title";
import { requireMe } from "@/lib/data";
import { EVENT_FIELDS, type EventRow, toLocalInput } from "@/lib/event-format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "edit event" };

export default async function EditEventPage(props: PageProps<"/events/[slug]/edit">) {
  const { slug } = await props.params;
  const me = await requireMe();
  const supabase = await createClient();
  const [{ data: ev }, { data: admin }] = await Promise.all([
    supabase.from("events").select(EVENT_FIELDS).eq("slug", slug).maybeSingle<EventRow>(),
    supabase.rpc("is_admin"),
  ]);
  if (!ev || (ev.host_id !== me.id && admin !== true)) notFound();
  const { data: city } = ev.city_id ? await supabase.from("cities").select("id, name, country").eq("id", ev.city_id).maybeSingle<City>() : { data: null };
  return (
    <>
      <ScreenTitle title="edit event" />
      <EventForm
        uid={me.id}
        eventId={ev.id}
        initialCity={city}
        initial={{
          title: ev.title,
          body_md: ev.body_md,
          cover_path: ev.cover_path,
          starts_local: toLocalInput(ev.starts_at, ev.timezone),
          ends_local: toLocalInput(ev.ends_at, ev.timezone),
          timezone: ev.timezone,
          online: ev.online,
          city_id: ev.city_id,
          venue: ev.venue ?? "",
          address: ev.address ?? "",
          price: ev.price ?? "",
          registration_url: ev.registration_url ?? "",
          source_url: ev.source_url ?? "",
        }}
      />
    </>
  );
}
