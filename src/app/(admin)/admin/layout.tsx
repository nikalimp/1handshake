import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { buttonClass } from "@/components/button";
import { Logo } from "@/components/logo";
import { SignInButton } from "@/components/sign-in-button";
import { adminBase, adminState } from "@/lib/admin";
import { APP_URL } from "@/lib/env";

export const metadata: Metadata = {
  title: { default: "admin", template: "%s · 1handshake admin" },
  robots: { index: false, follow: false, nocache: true },
};

// Series colours for the admin charts, checked for colour-blind separation on both surfaces:
// 🤝 met in person · 🔗 via intro · 🎟 at an event. Single-series charts use the brand fire.
const SERIES_CSS = `
:root{--series-met:#eb6834;--series-intro:#2a78d6;--series-event:#1baf7a}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--series-met:#d95926;--series-intro:#3987e5;--series-event:#199e70}}
:root[data-theme="dark"]{--series-met:#d95926;--series-intro:#3987e5;--series-event:#199e70}`;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const base = await adminBase();
  const state = await adminState();

  if (state.kind !== "admin") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 px-4 text-center">
        <Logo size={48} />
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] leading-8 font-extrabold tracking-[-0.03em]">1handshake admin</h1>
          <p className="text-ink-muted">
            {state.kind === "signed-out" ? "moderators only. sign in with the google account you use in the club." : "no access. this panel is for club moderators."}
          </p>
        </div>
        {state.kind === "signed-out" ? (
          <SignInButton next={base || "/"} className="w-full" />
        ) : (
          <div className="flex w-full flex-col gap-3">
            <form action="/auth/signout" method="post">
              <button className={buttonClass("secondary", "md", "w-full")}>sign out</button>
            </form>
            <a href={APP_URL} className="meta hover:text-ink">
              back to the app ↗
            </a>
          </div>
        )}
      </main>
    );
  }

  const { data: badges } = await state.supabase.rpc("admin_badges").maybeSingle<{ events: number; reports: number }>();
  const waiting = Number(badges?.events ?? 0) + Number(badges?.reports ?? 0);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <style>{SERIES_CSS}</style>
      <AdminNav base={base} badges={{ moderation: waiting }} me={{ name: state.me.name }} appUrl={APP_URL} />
      <main className="mx-auto w-full max-w-[1120px] px-4 pt-2 pb-16 md:px-10 md:pt-6">{children}</main>
    </div>
  );
}
