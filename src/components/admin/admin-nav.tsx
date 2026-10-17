"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

type Item = { href: string; label: string; badge?: number; icon: ReactNode };

const icons = {
  overview: <><path d="M4 19V10M10 19V5M16 19v-7M21 19H3" /></>,
  members: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c1-3 3.2-4.5 5.5-4.5s4.5 1.5 5.5 4.5" /><path d="M16 5.5a3 3 0 0 1 0 5.6M18.5 19c-.4-1.6-1.1-2.8-2.1-3.6" /></>,
  moderation: <><path d="M12 3 5 6v5c0 4.4 3 8.2 7 10 4-1.8 7-5.6 7-10V6z" /><path d="m9 12 2 2 4-4" /></>,
};

/** Sidebar on desktop, a row of tabs on the phone. `base` is "" on the admin domain and "/admin" elsewhere. */
export function AdminNav({ base, badges, me, appUrl }: { base: string; badges: { moderation: number }; me: { name: string | null }; appUrl: string }) {
  const path = usePathname();
  const items: Item[] = [
    { href: base || "/", label: "overview", icon: icons.overview },
    { href: `${base}/members`, label: "members", icon: icons.members },
    { href: `${base}/moderation`, label: "moderation", badge: badges.moderation, icon: icons.moderation },
  ];
  // usePathname shows the address bar path: "/members" on the admin domain, "/admin/members" on localhost.
  const isOn = (href: string) => (href === (base || "/") ? path === href || path === `${href}/` : path.startsWith(href));

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line px-4 py-6 md:flex">
        <Link href={base || "/"} className="flex items-center gap-2 px-2">
          <Logo size={28} />
          <span className="font-mono text-xs tracking-[0.08em] text-ink-muted">admin</span>
        </Link>
        <nav aria-label="admin" className="flex flex-col gap-1">
          {items.map((it) => {
            const on = isOn(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={on ? "page" : undefined}
                className={`flex h-10 items-center gap-3 rounded-full px-3 font-semibold ${on ? "bg-fire text-on-fire" : "text-ink-muted hover:bg-surface-sunk hover:text-ink"}`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]" aria-hidden>
                  {it.icon}
                </svg>
                <span className="flex-1">{it.label}</span>
                {it.badge ? <Badge n={it.badge} on={on} /> : null}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-2 px-2">
          <p className="truncate text-sm font-semibold">{me.name ?? "admin"}</p>
          <a href={appUrl} className="meta hover:text-ink">
            open the app ↗
          </a>
          <form action="/auth/signout" method="post">
            <button className="meta hover:text-ink">sign out</button>
          </form>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex flex-col gap-2 border-b border-line bg-paper/95 px-4 pt-3 pb-2 backdrop-blur md:hidden">
        <div className="flex items-center justify-between">
          <Link href={base || "/"} className="flex items-center gap-2">
            <Logo size={24} />
            <span className="font-mono text-xs tracking-[0.08em] text-ink-muted">admin</span>
          </Link>
          <form action="/auth/signout" method="post">
            <button className="meta hover:text-ink">sign out</button>
          </form>
        </div>
        <nav aria-label="admin" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {items.map((it) => {
            const on = isOn(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={on ? "page" : undefined}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ${on ? "bg-fire text-on-fire" : "bg-surface-sunk text-ink"}`}
              >
                {it.label}
                {it.badge ? <Badge n={it.badge} on={on} /> : null}
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}

function Badge({ n, on }: { n: number; on: boolean }) {
  return (
    <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 font-mono text-[11px] ${on ? "bg-on-fire text-fire" : "bg-fire text-on-fire"}`} aria-label={`${n} waiting`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}
