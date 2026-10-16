"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/button";
import { APP_URL, CARD_URL } from "@/lib/env";

// Sign-in always comes back to the app: on the main site (1handshake.com, which only proxies cards)
// there is no /auth/callback. Previews and localhost keep their own origin.
const appOrigin = () => (CARD_URL !== APP_URL && window.location.origin === new URL(CARD_URL).origin ? APP_URL : window.location.origin);

/** Google sign-in. `next` is where the member lands after /auth/callback. */
export function SignInButton({ next = "/connect", label = "continue with google", className = "" }: { next?: string; label?: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const supabase = createClient();
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${appOrigin()}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (error) setBusy(false);
      }}
    >
      {busy ? "opening google…" : label}
    </Button>
  );
}
