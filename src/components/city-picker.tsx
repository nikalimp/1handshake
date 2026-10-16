"use client";
import { useCallback, useState } from "react";
import { Combobox, type Option } from "@/components/combobox";
import { createClient } from "@/lib/supabase/client";

export type City = { id: number; name: string; country: string | null };

const toOption = (c: City): Option => ({
  id: c.id,
  label: c.name,
  hint: c.country ?? undefined,
});

/** Type a city, pick it from the world list (9k cities, the biggest first). */
export function CityPicker({
  value,
  onChange,
  className,
  note,
}: {
  value: City | null;
  onChange: (c: City | null) => void;
  className?: string;
  note?: string | null;
}) {
  const [supabase] = useState(createClient);
  const [locating, setLocating] = useState<"idle" | "busy" | "denied" | "none">(
    "idle",
  );
  const locate = () => {
    if (!navigator.geolocation) return setLocating("denied");
    setLocating("busy");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { data } = await supabase.rpc("nearest_city", {
          p_lat: coords.latitude,
          p_lng: coords.longitude,
        });
        const city = ((data ?? []) as City[])[0];
        if (city) {
          onChange(city);
          setLocating("idle");
        } else setLocating("none");
      },
      () => setLocating("denied"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };
  const search = useCallback(
    async (q: string) => {
      const term = q
        .split(",")[0]
        .trim()
        .replace(/[%_\\]/g, "");
      const query = (pattern: string) =>
        supabase
          .from("cities")
          .select("id, name, country")
          .ilike("name", pattern)
          .order("population", { ascending: false, nullsFirst: false })
          .limit(20)
          .returns<City[]>();
      const { data: starts } = await query(`${term}%`);
      let rows = starts ?? [];
      if (term.length >= 3 && rows.length < 8) {
        const { data: inside } = await query(`%${term}%`);
        rows = [
          ...rows,
          ...(inside ?? []).filter((c) => !rows.some((r) => r.id === c.id)),
        ].slice(0, 20);
      }
      return rows.map(toOption);
    },
    [supabase],
  );
  return (
    <div className="flex flex-col gap-1.5">
      <Combobox
        label="city"
        placeholder="start typing your city"
        value={value ? toOption(value) : null}
        onChange={(o) =>
          onChange(
            o ? { id: o.id, name: o.label, country: o.hint ?? null } : null,
          )
        }
        search={search}
        className={className}
        emptyText="no such city in our list yet"
      />
      <div className="flex items-center justify-between gap-3 px-1">
        <span className="meta">
          {locating === "denied"
            ? "location is off — type your city instead"
            : locating === "none"
              ? "no city near you in our list — type it"
              : (note ?? "")}
        </span>
        <button
          type="button"
          onClick={locate}
          disabled={locating === "busy"}
          className="meta shrink-0 hover:text-ink disabled:opacity-50"
        >
          {locating === "busy" ? "locating…" : "📍 use my location"}
        </button>
      </div>
    </div>
  );
}
