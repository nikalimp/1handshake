"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { City } from "@/components/city-picker";
import { getMe } from "@/lib/data";
import { downloadCover, importFromLuma, type ImportedEvent } from "@/lib/luma";
import { firstName, sendPush } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { rebuildSite } from "@/lib/site-hook";
import { createClient } from "@/lib/supabase/server";

export type EventInput = {
  title: string;
  body_md: string;
  cover_path: string | null;
  starts_local: string;
  ends_local: string;
  timezone: string;
  online: boolean;
  city_id: number | null;
  venue: string;
  address: string;
  price: string;
  registration_url: string;
  source_url: string;
};

const ERRORS: [RegExp, string][] = [
  [/time zone/, "pick a time zone"],
  [/bad date|start date/, "add the date and time it starts"],
  [/end is before/, "the end is before the start"],
  [/https/, "the registration link must start with https://"],
  [/not your event/, "only the host can edit this event"],
  [/title|check constraint "events_title/, "the title needs 3–120 characters"],
  [/bad cover/, "upload the cover again"],
];

/** Create (id null) or edit an event. New events wait for an admin before they're public. */
export async function saveEvent(id: string | null, input: EventInput): Promise<{ slug: string } | { error: string }> {
  const me = await getMe();
  if (!me) return { error: "members only" };
  if (input.title.trim().length < 3) return { error: "the title needs at least 3 characters" };
  if (!input.starts_local) return { error: "add the date and time it starts" };
  let reg = input.registration_url.trim();
  if (reg && !/^https?:\/\//.test(reg)) reg = `https://${reg}`;
  reg = reg.replace(/^http:\/\//, "https://");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_event", { p_id: id, p: { ...input, registration_url: reg, title: input.title.trim().slice(0, 120) } }).single<{ id: string; slug: string; review: string }>();
  if (error || !data) return { error: ERRORS.find(([re]) => re.test(error?.message ?? ""))?.[1] ?? "couldn't save the event. try again." };
  if (!id) {
    after(async () => {
      const admin = createAdminClient();
      if (!admin) return;
      const { data: admins } = await admin.from("admins").select("profile_id").returns<{ profile_id: string }[]>();
      await sendPush(
        (admins ?? []).map((a) => a.profile_id).filter((a) => a !== me.id),
        { title: "new event to review 🎟", body: `${firstName(me.name)}: ${input.title.slice(0, 80)}`, url: `/events/${data.slug}`, tag: `review-${data.id}` },
      );
    });
  }
  if (data.review === "approved") after(rebuildSite);
  revalidatePath("/events");
  revalidatePath("/feed");
  revalidatePath(`/events/${data.slug}`);
  return { slug: data.slug };
}

export async function setGoing(eventId: string, going: boolean): Promise<{ ok: true } | { error: string }> {
  const me = await getMe();
  if (!me) return { error: "members only" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_going", { p_event: eventId, p_going: going });
  if (error) return { error: "couldn't save. try again." };
  revalidatePath("/feed");
  revalidatePath("/events");
  return { ok: true };
}

export async function cancelEvent(eventId: string, slug: string): Promise<{ ok: true } | { error: string }> {
  const me = await getMe();
  if (!me) return { error: "members only" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_event", { p_event: eventId });
  if (error) return { error: "only the host can cancel" };
  after(rebuildSite);
  revalidatePath(`/events/${slug}`);
  revalidatePath("/events");
  revalidatePath("/feed");
  return { ok: true };
}

export async function newCheckinCode(eventId: string): Promise<{ code: string } | { error: string }> {
  const me = await getMe();
  if (!me) return { error: "members only" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("new_checkin_code", { p_event: eventId });
  if (error || !data) return { error: "only the host can change the code" };
  return { code: data as string };
}

/** Admin: approve (public calendar, check-in works) or reject. */
export async function reviewEvent(eventId: string, approve: boolean): Promise<{ ok: true } | { error: string }> {
  const me = await getMe();
  if (!me) return { error: "members only" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_event", { p_event: eventId, p_approve: approve });
  if (error) return { error: error.message.includes("admins only") ? "admins only" : "couldn't save. try again." };
  after(rebuildSite);
  after(async () => {
    const admin = createAdminClient();
    if (!admin) return;
    const { data: ev } = await admin.from("events").select("host_id, title, slug").eq("id", eventId).maybeSingle<{ host_id: string; title: string; slug: string }>();
    if (ev && ev.host_id !== me.id) {
      await sendPush([ev.host_id], approve
        ? { title: "your event is live 🎟", body: `${ev.title} is on the calendar. check-in opens 3 hours before the start.`, url: `/events/${ev.slug}`, tag: `review-${eventId}` }
        : { title: "your event wasn't approved", body: `${ev.title} — edit it and it goes back to review.`, url: `/events/${ev.slug}`, tag: `review-${eventId}` });
    }
  });
  revalidatePath("/admin");
  revalidatePath("/events");
  revalidatePath("/feed");
  return { ok: true };
}

/** Fill the form from a Luma link: fields, the city by coordinates and the cover copied into our storage. */
export async function importEvent(url: string): Promise<{ event: Omit<ImportedEvent, "cover_remote" | "lat" | "lng">; cover_path: string | null; city: City | null } | { error: string }> {
  const me = await getMe();
  if (!me) return { error: "members only" };
  const got = await importFromLuma(url);
  if ("error" in got) return got;
  const supabase = await createClient();
  const { cover_remote, lat, lng, ...event } = got;
  const [cover, city] = await Promise.all([
    cover_remote ? downloadCover(cover_remote) : Promise.resolve(null),
    lat !== null && lng !== null ? supabase.rpc("nearest_city", { p_lat: lat, p_lng: lng }).then(({ data }) => ((data ?? []) as City[])[0] ?? null) : Promise.resolve(null),
  ]);
  let cover_path: string | null = null;
  if (cover) {
    const ext = cover.type === "image/png" ? "png" : cover.type === "image/webp" ? "webp" : cover.type === "image/gif" ? "gif" : "jpg";
    const path = `${me.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("covers").upload(path, cover.bytes, { contentType: cover.type });
    if (!error) cover_path = path;
  }
  return { event, cover_path, city };
}
