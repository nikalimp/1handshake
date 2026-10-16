"use client";
import { useSyncExternalStore } from "react";
import { THEME_KEY } from "@/lib/theme";

type Theme = "system" | "light" | "dark";
const KEY = THEME_KEY;
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function apply(t: Theme) {
  try {
    if (t === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {}
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  listeners.forEach((l) => l());
}

export function ThemeSwitch() {
  const theme = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => "system" as Theme,
  );
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="font-semibold">theme</span>
      <div className="flex gap-1 rounded-full bg-surface-sunk p-1 text-sm font-semibold" role="radiogroup" aria-label="theme">
        {(["system", "light", "dark"] as const).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => apply(t)} className={`rounded-full px-3 py-1 ${theme === t ? "bg-surface shadow-sm" : "text-ink-muted"}`}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
