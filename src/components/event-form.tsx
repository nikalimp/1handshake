"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { importEvent, saveEvent, type EventInput } from "@/app/(app)/events/actions";
import { Button } from "@/components/button";
import { type City, CityPicker } from "@/components/city-picker";
import { MarkdownField } from "@/components/markdown-field";
import { coverUrl, tzLabel } from "@/lib/event-format";
import { fileToSquareJpeg } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";

let zones: string[] | null = null;
const allZones = () => (zones ??= typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []);
const noSubscribe = () => () => {};

const field = "w-full rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3 outline-none focus:border-line-strong";

/** Host an event, or edit one. `initial` comes from the server; the time zone defaults to the visitor's. */
export function EventForm({ uid, eventId, initial, initialCity }: { uid: string; eventId: string | null; initial: EventInput; initialCity: City | null }) {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const [f, setF] = useState<EventInput>(initial);
  const [city, setCity] = useState<City | null>(initialCity);
  const [cover, setCover] = useState<string | null>(coverUrl(initial.cover_path));
  const [uploading, setUploading] = useState(false);
  const [luma, setLuma] = useState("");
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);
  const zoneList = useSyncExternalStore(noSubscribe, allZones, () => null);

  const set = <K extends keyof EventInput>(k: K, v: EventInput[K]) => setF((x) => ({ ...x, [k]: v }));

  const pickCover = async (picked: File) => {
    setUploading(true);
    setError(null);
    try {
      const blob = await fileToSquareJpeg(picked, 1200);
      const path = `${uid}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("covers").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      set("cover_path", path);
      setCover(URL.createObjectURL(blob));
    } catch {
      setError("couldn't upload the cover. try another picture.");
    } finally {
      setUploading(false);
    }
  };

  const runImport = async () => {
    setImporting(true);
    setError(null);
    const res = await importEvent(luma);
    setImporting(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setF((x) => ({ ...x, ...res.event, cover_path: res.cover_path ?? x.cover_path }));
    if (res.cover_path) setCover(coverUrl(res.cover_path));
    if (res.city) setCity(res.city);
    setImported(true);
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await saveEvent(eventId, { ...f, city_id: f.online ? null : (city?.id ?? null) });
      if ("error" in res) setError(res.error);
      else router.push(`/events/${res.slug}`);
    });

  return (
    <div className="flex flex-col gap-5">
      {!eventId && (
        <section className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-dashed border-line-strong p-4" aria-label="import from luma">
          <p className="text-sm font-semibold">already on luma? paste the link — we fill in the rest</p>
          <div className="flex gap-2">
            <input value={luma} onChange={(e) => setLuma(e.target.value)} placeholder="luma.com/…" inputMode="url" className={`${field} py-2.5`} />
            <Button size="sm" variant="secondary" className="h-auto shrink-0" disabled={importing || luma.trim().length < 8} onClick={runImport}>
              {importing ? "importing…" : "import"}
            </Button>
          </div>
          {imported && <p className="meta">imported from luma · check everything below</p>}
        </section>
      )}

      <button type="button" onClick={() => file.current?.click()} className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-[var(--radius-lg)] border-[1.5px] border-dashed border-line-strong bg-surface-sunk" aria-label="cover">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="font-semibold text-ink-muted">{uploading ? "uploading…" : "+ cover · square works best"}</span>
        )}
        {cover && <span className="absolute right-3 bottom-3 rounded-full bg-surface px-3 py-1.5 text-sm font-semibold shadow-[var(--shadow-card)]">{uploading ? "uploading…" : "change cover"}</span>}
      </button>
      <input
        ref={file}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (picked) void pickCover(picked);
        }}
      />

      <label className="flex flex-col gap-1.5">
        <span className="meta">title</span>
        <input value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={120} placeholder="e.g. founders breakfast" className={`${field} text-[20px] font-extrabold tracking-[-0.02em]`} />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="meta">starts</span>
          <input type="datetime-local" value={f.starts_local} onChange={(e) => set("starts_local", e.target.value)} className={`${field} px-3`} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="meta">ends · optional</span>
          <input type="datetime-local" value={f.ends_local} min={f.starts_local || undefined} onChange={(e) => set("ends_local", e.target.value)} className={`${field} px-3`} />
        </label>
      </div>
      <label className="-mt-2 flex flex-col gap-1.5">
        <span className="meta">time zone · {tzLabel(f.timezone)}</span>
        <select value={f.timezone} onChange={(e) => set("timezone", e.target.value)} className={field}>
          {(zoneList && zoneList.includes(f.timezone) ? zoneList : [f.timezone, ...(zoneList ?? [])]).map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
        <label className="flex items-center justify-between gap-3">
          <span className="font-semibold">online event</span>
          <input type="checkbox" checked={f.online} onChange={(e) => set("online", e.target.checked)} className="h-5 w-5 accent-[var(--fire)]" />
        </label>
        {!f.online && (
          <>
            <CityPicker value={city} onChange={setCity} className={field} />
            <input value={f.venue} onChange={(e) => set("venue", e.target.value)} maxLength={120} placeholder="venue, e.g. a café or a coworking" className={field} />
            <input value={f.address} onChange={(e) => set("address", e.target.value)} maxLength={300} placeholder="address" className={field} />
          </>
        )}
      </div>

      <div className="grid grid-cols-[2fr_3fr] gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="meta">price</span>
          <input value={f.price} onChange={(e) => set("price", e.target.value)} maxLength={40} placeholder="free" className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="meta">registration link · optional</span>
          <input value={f.registration_url} onChange={(e) => set("registration_url", e.target.value)} maxLength={500} inputMode="url" placeholder="https://luma.com/…" className={field} />
        </label>
      </div>

      <MarkdownField label="about the event" value={f.body_md} onChange={(v) => set("body_md", v)} maxLength={8000} rows={10} placeholder="what happens, who it's for, the plan for the evening" />

      {error && (
        <p role="alert" className="rounded-[var(--radius-md)] bg-fire-soft px-4 py-3 text-sm text-fire-ink">
          {error}
        </p>
      )}
      <Button className="w-full" disabled={pending || uploading} onClick={submit}>
        {pending ? "saving…" : eventId ? "save changes" : "publish event"}
      </Button>
      {!eventId && <p className="meta -mt-2 text-center">your connections see it in the feed right away · the club calendar and check-in open once we approve it</p>}
    </div>
  );
}
