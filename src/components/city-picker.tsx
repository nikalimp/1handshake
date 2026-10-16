"use client";
import { useCallback, useState } from "react";
import { Combobox, type Option } from "@/components/combobox";
import { createClient } from "@/lib/supabase/client";

export type City = { id: number; name: string; country: string | null };

const toOption = (c: City): Option => ({ id: c.id, label: c.name, hint: c.country ?? undefined });

/** Type a city, pick it from the world list (9k cities, the biggest first). */
export function CityPicker({ value, onChange, className }: { value: City | null; onChange: (c: City | null) => void; className?: string }) {
  const [supabase] = useState(createClient);
  const search = useCallback(
    async (q: string) => {
      const term = q.split(",")[0].trim().replace(/[%_\\]/g, "");
      const query = (pattern: string) =>
        supabase.from("cities").select("id, name, country").ilike("name", pattern).order("population", { ascending: false, nullsFirst: false }).limit(20).returns<City[]>();
      const { data: starts } = await query(`${term}%`);
      let rows = starts ?? [];
      if (term.length >= 3 && rows.length < 8) {
        const { data: inside } = await query(`%${term}%`);
        rows = [...rows, ...(inside ?? []).filter((c) => !rows.some((r) => r.id === c.id))].slice(0, 20);
      }
      return rows.map(toOption);
    },
    [supabase],
  );
  return (
    <Combobox
      label="city"
      placeholder="start typing your city"
      value={value ? toOption(value) : null}
      onChange={(o) => onChange(o ? { id: o.id, name: o.label, country: o.hint ?? null } : null)}
      search={search}
      className={className}
      emptyText="no such city in our list yet"
    />
  );
}
