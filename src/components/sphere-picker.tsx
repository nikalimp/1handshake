"use client";
import { useCallback, useMemo } from "react";
import { Combobox, type Option } from "@/components/combobox";

export type Sphere = { id: number; parent_id: number | null; name: string };

const field = "w-full rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3 outline-none focus:border-line-strong";

/** Up to 3 spheres: chips (★ = main, tap another to make it main, ✕ to remove) and a searchable "add". */
export function SpherePicker({ value, onChange, spheres }: { value: number[]; onChange: (ids: number[]) => void; spheres: Sphere[] }) {
  const sphereName = useMemo(() => new Map(spheres.map((s) => [s.id, s.name])), [spheres]);
  const search = useCallback(
    (q: string): Option[] => {
      const term = q.trim().toLowerCase();
      return spheres
        .filter((p) => p.parent_id === null)
        .flatMap((p) =>
          spheres
            .filter((s) => s.parent_id === p.id && (!term || s.name.toLowerCase().includes(term) || p.name.toLowerCase().includes(term)))
            .sort((a, b) => Number(!a.name.toLowerCase().startsWith(term)) - Number(!b.name.toLowerCase().startsWith(term)))
            .map((s) => ({ id: s.id, label: s.name, group: p.name, disabled: value.includes(s.id), hint: value.includes(s.id) ? "added" : undefined })),
        );
    },
    [spheres, value],
  );
  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((id, i) => (
            <li key={id} className={`flex items-center rounded-full text-sm ${i === 0 ? "bg-fire font-semibold text-on-fire" : "bg-surface-sunk"}`}>
              <button type="button" disabled={i === 0} onClick={() => onChange([id, ...value.filter((x) => x !== id)])} className="py-1.5 pl-3" title={i === 0 ? "your main sphere" : "make it main"}>
                {i === 0 && "★ "}
                {sphereName.get(id)}
              </button>
              <button type="button" aria-label={`remove ${sphereName.get(id)}`} onClick={() => onChange(value.filter((x) => x !== id))} className="py-1.5 pr-3 pl-2 opacity-70 hover:opacity-100">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.length < 3 ? (
        <Combobox
          label="add a sphere"
          placeholder={value.length ? "add another, e.g. product, ios, seo" : "type, e.g. product, ios, seo"}
          value={null}
          clearOnSelect
          onChange={(o) => o && onChange([...value, o.id])}
          search={search}
          className={field}
        />
      ) : (
        <p className="meta">that&apos;s 3 · remove one to pick another</p>
      )}
    </div>
  );
}
