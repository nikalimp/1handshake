import Link from "next/link";
import type { ReactNode } from "react";

// Filter bar pieces for admin lists. Plain GET forms: the URL holds the filters,
// selects and dates submit on change (AutoSubmit).

export const selectClass = "h-10 w-full rounded-full bg-surface-sunk px-3 text-sm outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--ink)]";

export function Select({ name, label, value, options, all = "all" }: { name: string; label: string; value?: string; options: { value: string; label: string }[]; all?: string }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="meta px-1">{label}</span>
      <select name={name} defaultValue={value ?? ""} className={selectClass}>
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DateField({ name, label, value }: { name: string; label: string; value?: string }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="meta px-1">{label}</span>
      <input type="date" name={name} defaultValue={value ?? ""} className={selectClass} />
    </label>
  );
}

export function SearchRow({ value, placeholder }: { value?: string; placeholder: string }) {
  return (
    <div className="flex gap-2">
      <input
        name="q"
        defaultValue={value ?? ""}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 min-w-0 flex-1 rounded-full bg-surface-sunk px-4 outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--ink)]"
      />
      <button className="h-10 rounded-full bg-fire px-4 text-sm font-semibold text-on-fire">search</button>
    </div>
  );
}

/** Status chips as links: one is always on; counts are optional. */
export function Chips({ items, current, href }: { items: { key: string; label: string; n?: number }[]; current: string; href: (key: string) => string }) {
  return (
    <nav aria-label="status" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      {items.map((it) => {
        const on = it.key === current;
        return (
          <Link
            key={it.key}
            href={href(it.key)}
            scroll={false}
            aria-current={on ? "true" : undefined}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ${on ? "bg-ink text-paper" : "bg-surface-sunk text-ink hover:bg-line"}`}
          >
            {it.label}
            {it.n ? <span className={`font-mono text-[11px] ${on ? "opacity-70" : "text-ink-muted"}`}>{it.n}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function PageHeader({ title, meta, children }: { title: string; meta?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 pt-4 pb-4 md:pt-0">
      <h1 className="text-[32px] leading-9 font-extrabold tracking-[-0.03em]">{title}</h1>
      {meta && <p className="meta">{meta}</p>}
      {children}
    </header>
  );
}

export function Pager({ page, total, size, href }: { page: number; total: number; size: number; href: (page: number) => string }) {
  if (total <= size) return null;
  return (
    <nav aria-label="pages" className="mt-4 flex items-center justify-between">
      {page > 0 ? (
        <Link href={href(page - 1)} className="meta hover:text-ink">
          ← newer
        </Link>
      ) : (
        <span />
      )}
      <span className="meta">
        {page * size + 1}–{Math.min(total, (page + 1) * size)} of {total}
      </span>
      {(page + 1) * size < total ? (
        <Link href={href(page + 1)} className="meta hover:text-ink">
          older →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/** Builds list links that keep the current filters. */
export function queryHref(base: string, current: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...patch })) if (v) q.set(k, v);
  const s = q.toString();
  return `${base}${s ? `?${s}` : ""}`;
}
