import Link from "next/link";
import { buttonClass } from "@/components/button";
import { Confetti } from "@/components/confetti";
import { EventCover } from "@/components/event-view";
import { InviteProblem } from "@/components/invite-problem";
import { Logo } from "@/components/logo";
import { SignInButton } from "@/components/sign-in-button";
import { formatWhen } from "@/lib/event-format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "check in", robots: { index: false } };

type CodeInfo = { id: string; slug: string; title: string; cover_path: string | null; starts_at: string; ends_at: string | null; timezone: string; venue: string | null; state: string; here: number };

const STATE: Record<string, string> = {
  "not open yet": "check-in opens 3 hours before the start. come back then.",
  over: "this event is over — check-in is closed.",
  cancelled: "this event was cancelled.",
  "not approved": "this event isn't approved yet, so check-in doesn't work.",
};

const NEWCOMER = "new here? check-in is for members. find a member at the event — a selfie together gets you into the club, then scan this again.";

// The host's QR at the venue, for members: checking in shows everyone who came, on connect.
// Newcomers join the usual way — a handshake with a member, who is likely right there.
export default async function CheckIn(props: PageProps<"/in/[code]">) {
  const { code } = await props.params;
  const { error: why } = await props.searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("event_by_code", { p_code: code });
  const info = ((data ?? []) as CodeInfo[])[0];
  if (!info) {
    return (
      <InviteProblem title="this qr doesn't work">
        <p className="text-ink-muted">the host may have made a new one. scan the qr at the entrance again.</p>
      </InviteProblem>
    );
  }
  const { data: claims } = await supabase.auth.getClaims();
  const signedIn = Boolean(claims?.claims?.sub);

  if (!signedIn || info.state !== "open") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8">
        <Logo size={40} className="mx-auto text-fire" />
        <div className="mt-5 overflow-hidden rounded-[var(--radius-lg)] shadow-[var(--shadow-card)]">
          <EventCover path={info.cover_path} title={info.title} />
        </div>
        <p className="meta mt-4 text-center">{formatWhen(info)}{info.venue ? ` · ${info.venue}` : ""}</p>
        <h1 className="mt-1 text-center text-[28px] leading-8 font-extrabold tracking-[-0.03em]">{info.title}</h1>
        {info.state === "open" ? (
          <>
            <p className="mt-2 text-center text-ink-muted">members: check in to see everyone who came{info.here > 0 ? ` — ${info.here} here already` : ""} and connect in a tap.</p>
            {why === "members-only" && (
              <p role="alert" className="mt-4 rounded-[var(--radius-md)] bg-fire-soft px-4 py-3 text-center text-sm text-fire-ink">
                this google account isn&apos;t a member yet. {NEWCOMER.replace("new here? check-in is for members. ", "")}
              </p>
            )}
            <div className="mt-auto pt-8">
              <SignInButton className="w-full" label="check in with google" next={`/in/${code}`} />
              <p className="meta mt-3 text-center">{NEWCOMER}</p>
            </div>
          </>
        ) : (
          <p className="mt-3 rounded-[var(--radius-md)] bg-surface-sunk px-4 py-3 text-center text-sm">{STATE[info.state] ?? "check-in is closed."}</p>
        )}
      </main>
    );
  }

  const { data: rows, error } = await supabase.rpc("event_check_in", { p_code: code });
  const done = ((rows ?? []) as { event_id: string; slug: string; title: string }[])[0];
  if (error || !done) {
    const newcomer = error?.message.includes("not a member");
    return (
      <InviteProblem title={newcomer ? "check-in is for members" : "couldn't check you in"}>
        <p className="text-ink-muted">{newcomer ? "find a member at the event — a selfie together gets you into the club. then scan this qr again." : "try scanning the qr again."}</p>
      </InviteProblem>
    );
  }
  const { data: now } = await supabase.rpc("event_by_code", { p_code: code });
  const here = ((now ?? []) as CodeInfo[])[0]?.here ?? 1;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <Confetti />
      <span className="text-5xl">🎟</span>
      <h1 className="text-[30px] leading-[34px] font-extrabold tracking-[-0.03em]">you&apos;re checked in</h1>
      <p className="text-ink-muted">
        {info.title} · {here > 1 ? `${here} people here` : "you're the first one here"}
      </p>
      <div className="mt-2 flex w-full flex-col gap-3">
        <Link href="/connect" className={buttonClass("primary")}>
          meet who&apos;s here
        </Link>
        <Link href={`/events/${done.slug}`} className={buttonClass("secondary")}>
          event page
        </Link>
      </div>
    </main>
  );
}
