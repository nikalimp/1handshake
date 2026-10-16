import { headers } from "next/headers";
import { EventForm } from "@/components/event-form";
import { ScreenTitle } from "@/components/screen-title";
import type { City } from "@/components/city-picker";
import { requireMe } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "host an event" };

export default async function NewEventPage() {
  const me = await requireMe();
  const supabase = await createClient();
  // Vercel tells the visitor's time zone; the browser list takes over in the form.
  const tz = (await headers()).get("x-vercel-ip-timezone") ?? "UTC";
  const { data: city } = me.city_id ? await supabase.from("cities").select("id, name, country").eq("id", me.city_id).maybeSingle<City>() : { data: null };
  return (
    <>
      <ScreenTitle title="host an event" />
      <p className="meta -mt-2 mb-5 px-0.5">members who check in with your qr see everyone who came and connect in a tap</p>
      <EventForm
        uid={me.id}
        eventId={null}
        initialCity={city}
        initial={{ title: "", body_md: "", cover_path: null, starts_local: "", ends_local: "", timezone: tz, online: false, city_id: city?.id ?? null, venue: "", address: "", price: "", registration_url: "", source_url: "" }}
      />
    </>
  );
}
