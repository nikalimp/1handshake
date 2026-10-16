"use client";
import { useEffect, useId, useRef, useState } from "react";

export type Option = { id: number; label: string; hint?: string; group?: string; disabled?: boolean };

/**
 * A select you can type into. `search` returns the options for a query (sync or async).
 * With `clearOnSelect` it works as an "add…" field: picks are reported, the input empties.
 */
export function Combobox({
  value,
  onChange,
  search,
  placeholder,
  label,
  className = "",
  clearOnSelect = false,
  emptyText = "nothing found",
}: {
  value: Option | null;
  onChange: (o: Option | null) => void;
  search: (q: string) => Option[] | Promise<Option[]>;
  placeholder: string;
  label: string;
  className?: string;
  clearOnSelect?: boolean;
  emptyText?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value?.label ?? "");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Option[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const ask = useRef(0);
  // A value picked from outside (e.g. "use my location") shows up in the field.
  const [shown, setShown] = useState(value?.label);
  if (value?.label !== shown) {
    setShown(value?.label);
    if (value && !clearOnSelect) setText(value.label);
  }

  useEffect(() => {
    if (!open) return;
    const n = ++ask.current;
    const q = text === value?.label ? "" : text.trim();
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await search(q);
      if (n !== ask.current) return;
      setOptions(res);
      setActive(Math.max(0, res.findIndex((o) => !o.disabled)));
      setLoading(false);
    }, 120);
    return () => clearTimeout(t);
  }, [text, open, search, value?.label]);

  const pick = (o: Option) => {
    if (o.disabled) return;
    onChange(o);
    setText(clearOnSelect ? "" : o.label);
    setOpen(clearOnSelect);
    if (clearOnSelect) input.current?.focus();
  };

  const close = () => {
    setOpen(false);
    setText(clearOnSelect ? "" : (value?.label ?? ""));
  };

  const step = (d: 1 | -1) => {
    if (!options.length) return;
    let i = active;
    for (let k = 0; k < options.length; k++) {
      i = (i + d + options.length) % options.length;
      if (!options[i].disabled) break;
    }
    setActive(i);
    document.getElementById(`${id}-${i}`)?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div className="relative" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && close()}>
      <input
        ref={input}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined}
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        onFocus={(e) => {
          setOpen(true);
          e.target.select();
        }}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          if (!e.target.value && !clearOnSelect) onChange(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (open) step(1);
            else setOpen(true);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            step(-1);
          } else if (e.key === "Enter" && open && options[active]) {
            e.preventDefault();
            pick(options[active]);
          } else if (e.key === "Escape") close();
        }}
        className={`pr-10 ${className}`}
      />
      <span aria-hidden className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-muted">
        {loading ? "…" : "⌄"}
      </span>
      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          className="absolute inset-x-0 top-[calc(100%+6px)] z-20 max-h-72 overflow-y-auto overscroll-contain rounded-[var(--radius-md)] border border-line bg-surface p-1 shadow-[var(--shadow-card)]"
        >
          {options.map((o, i) => {
            const head = o.group && o.group !== options[i - 1]?.group ? o.group : null;
            return (
              <li key={o.id} role="presentation">
                {head && <p className="meta px-3 pt-2 pb-1">{head}</p>}
                <div
                  id={`${id}-${i}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={i === active}
                  aria-disabled={o.disabled || undefined}
                  onMouseEnter={() => !o.disabled && setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o)}
                  className={`flex cursor-pointer items-baseline justify-between gap-3 rounded-[var(--radius-sm)] px-3 py-2 ${i === active ? "bg-surface-sunk" : ""} ${o.disabled ? "cursor-default opacity-40" : ""}`}
                >
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="meta shrink-0">{o.hint}</span>}
                </div>
              </li>
            );
          })}
          {!loading && options.length === 0 && <li className="meta px-3 py-2">{emptyText}</li>}
        </ul>
      )}
    </div>
  );
}
