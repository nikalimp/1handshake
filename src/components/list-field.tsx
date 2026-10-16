"use client";
import { useState } from "react";

/** A short list of one-line items: type, press enter (or "add"), remove with ✕. */
export function ListField({
  label,
  hint,
  items,
  onChange,
  max,
  placeholder,
}: {
  label: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
  max: number;
  placeholder: string;
}) {
  const [text, setText] = useState("");
  const add = () => {
    const v = text.trim().replace(/\s+/g, " ");
    if (!v || items.length >= max || items.includes(v)) return;
    onChange([...items, v]);
    setText("");
  };
  return (
    <div className="flex flex-col gap-2">
      <div>
        <span className="font-semibold">{label}</span>
        {hint && <span className="block text-sm text-ink-muted">{hint}</span>}
      </div>
      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((it, i) => (
            <li key={it} className="flex items-start gap-2 rounded-[var(--radius-md)] bg-surface-sunk py-2 pr-2 pl-3.5">
              <span className="min-w-0 flex-1 py-0.5 break-words">{it}</span>
              <button type="button" aria-label={`remove: ${it}`} onClick={() => onChange(items.filter((_, j) => j !== i))} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface hover:text-ink">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {items.length < max ? (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-line bg-surface pr-1.5 pl-4 focus-within:border-line-strong">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            onBlur={add}
            maxLength={200}
            placeholder={placeholder}
            aria-label={label}
            className="min-w-0 flex-1 bg-transparent py-3 outline-none placeholder:text-ink-muted focus-visible:outline-none"
          />
          <button type="button" onClick={add} disabled={!text.trim()} className="h-9 shrink-0 rounded-full px-3 text-sm font-semibold disabled:opacity-40">
            add
          </button>
        </div>
      ) : (
        <p className="meta">that&apos;s {max} · remove one to add another</p>
      )}
    </div>
  );
}
