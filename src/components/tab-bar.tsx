"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/feed", label: "feed", icon: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h8M8 17h5" /></> },
  { href: "/connect", label: "connect", icon: <><rect x="6" y="3" width="12" height="16" rx="3" /><path d="M4 7v12a2 2 0 0 0 2 2h10" /></> },
  { href: "/graph", label: "graph", icon: <><circle cx="12" cy="12" r="2.5" /><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="18" cy="19" r="2" /><path d="M10 10.5 6.5 7.3M14 10.5l3.5-3.2M13.6 13.9l3 3.6" /></> },
  { href: "/profile", label: "profile", icon: <><circle cx="12" cy="9" r="3.5" /><path d="M5 20c1.3-3.4 4-5 7-5s5.7 1.6 7 5" /></> },
];

export function TabBar() {
  const path = usePathname();
  return (
    <nav aria-label="main" className="fixed inset-x-4 bottom-[calc(16px+env(safe-area-inset-bottom,0px))] z-10 mx-auto grid max-w-[420px] grid-cols-4 gap-1 rounded-full bg-surface p-1.5 shadow-[var(--shadow-card)]">
      {tabs.map((t) => {
        const on = path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 rounded-full px-1 py-2 text-xs font-medium ${on ? "bg-fire text-on-fire" : "text-ink-muted"}`}
          >
            <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]">{t.icon}</svg>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
