import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { SignInButton } from "@/components/sign-in-button";
import { getMe } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";

export default async function Landing(props: PageProps<"/">) {
  const { error } = await props.searchParams;
  if (isSupabaseConfigured && (await getMe())) redirect("/connect");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-10">
      <Logo size={40} className="text-ink" />
      <div className="mt-auto flex flex-col gap-4">
        <h1 className="text-5xl leading-[50px] font-extrabold tracking-[-0.03em] text-balance">one handshake away</h1>
        <p className="text-ink-muted">
          a members-only club for people in tech. you get in only by meeting a member — in person, with a selfie to prove it.
        </p>
        {error === "members-only" && (
          <p role="alert" className="rounded-[var(--radius-md)] bg-fire-soft px-4 py-3 text-sm text-fire-ink">
            this google account isn&apos;t a member yet. ask a member for a handshake.
          </p>
        )}
      </div>
      <div className="mt-8 flex flex-col gap-3">
        {isSupabaseConfigured ? (
          <SignInButton className="w-full" />
        ) : (
          <p className="meta">set NEXT_PUBLIC_SUPABASE_URL and the publishable key to enable sign-in</p>
        )}
        <p className="meta text-center">members only · no waitlist · open source</p>
      </div>
    </main>
  );
}
