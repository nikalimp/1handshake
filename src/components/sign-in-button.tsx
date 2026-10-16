"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/button";

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
          options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (error) setBusy(false);
      }}
    >
      {busy ? "opening google…" : label}
    </Button>
  );
}
