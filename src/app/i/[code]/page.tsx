import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { buttonClass } from "@/components/button";
import { InviteProblem } from "@/components/invite-problem";
import { Logo } from "@/components/logo";
import { SignInButton } from "@/components/sign-in-button";
import { getMe } from "@/lib/data";
import { inviteProblem, openInvite, selfieUrl } from "@/lib/invites";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "welcome to the club", robots: { index: false } };

// The guest scanned the QR with their regular camera. Opening the page marks the code as scanned
// (the inviter's waiting screen sees it via realtime) and gives the guest 30 minutes to finish.
// A member who scans a member's code is connected right away instead.
export default async function InviteLanding(props: PageProps<"/i/[code]">) {
  const { code } = await props.params;
  const supabase = await createClient();

  const me = await getMe();
  if (me) {
    const { error } = await supabase.rpc("handshake_with_invite", { p_code: code });
    const inv = await openInvite(code);
    if (error) {
      const own = error.message.includes("own code");
      return (
        <InviteProblem title={own ? "this is your own code" : (inviteProblem(inv) ?? "this code doesn't work")}>
          <p className="text-ink-muted">{own ? "show it to the person you met — they scan it with their camera." : "ask them to make a new code."}</p>
          <Link href="/connect" className={buttonClass("secondary", "md", "mt-2")}>
            back to connect
          </Link>
        </InviteProblem>
      );
    }
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
        <span className="text-5xl">🤝</span>
        <h1 className="text-[30px] leading-[34px] font-extrabold tracking-[-0.03em]">you and {inv?.inviter_name ?? "them"} are connected</h1>
        <p className="text-ink-muted">met in person · just now</p>
        <div className="mt-2 flex w-full flex-col gap-3">
          {inv?.inviter_handle && (
            <Link href={`/people/${inv.inviter_handle}`} className={buttonClass("primary")}>
              open their profile
            </Link>
          )}
          <Link href="/connect" className={buttonClass("secondary")}>
            back to connect
          </Link>
        </div>
      </main>
    );
  }

  const inv = await openInvite(code);
  const problem = inviteProblem(inv);
  if (!inv || problem) return <InviteProblem title={problem ?? "this code doesn't exist"} />;

  const [selfie, { data: claims }] = await Promise.all([selfieUrl(inv.selfie_path), supabase.auth.getClaims()]);
  const signedIn = Boolean(claims?.claims?.sub);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-10">
      <Logo size={56} className="mx-auto text-fire" />
      <h1 className="mt-3 text-center text-[30px] leading-[34px] font-extrabold tracking-[-0.03em]">welcome to the club</h1>
      <p className="mt-1.5 mb-4 text-center text-ink-muted">members only. you got in with a handshake.</p>
      <div className="aspect-square w-full overflow-hidden rounded-[var(--radius-lg)] bg-surface-sunk">
        {selfie && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={selfie} alt={`joint selfie with ${inv.inviter_name}`} className="h-full w-full object-cover" />
        )}
      </div>
      <p className="mt-4 flex items-center justify-center gap-2.5 text-[15px]">
        <Avatar name={inv.inviter_name} size={28} /> invited by <b>{inv.inviter_name}</b>
      </p>
      <div className="mt-auto pt-8">
        {signedIn ? (
          <Link href={`/i/${code}/join`} className={buttonClass("primary", "md", "w-full")}>
            continue
          </Link>
        ) : (
          <SignInButton className="w-full" label="join with google" next={`/i/${code}/join`} />
        )}
        <p className="meta mt-2.5 text-center">1handshake.com/i/{code} · expires with {(inv.inviter_name ?? "their").split(" ")[0]}&apos;s code</p>
      </div>
    </main>
  );
}
