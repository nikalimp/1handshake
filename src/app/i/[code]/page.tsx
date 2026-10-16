import { Avatar } from "@/components/avatar";
import { Logo } from "@/components/logo";
import { SignInButton } from "@/components/sign-in-button";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "welcome to the club", robots: { index: false } };

type Opened = { status: "live" | "scanned" | "joined" | "expired" | "cancelled"; inviter_name: string | null; inviter_handle: string | null; selfie_path: string | null; expires_at: string };

// The guest scanned the QR with their regular camera. Opening the page marks the code as scanned
// (the inviter's waiting screen sees it via realtime) and gives the guest 30 minutes to finish.
export default async function InviteLanding(props: PageProps<"/i/[code]">) {
  const { code } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("open_invite", { p_code: code });
  const inv = (data as Opened[] | null)?.[0];

  if (!inv || inv.status === "expired" || inv.status === "cancelled" || inv.status === "joined") {
    const msg = !inv ? "this code doesn't exist" : inv.status === "joined" ? "this code was already used" : "this code expired";
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <Logo size={44} className="text-ink-muted" />
        <h1 className="text-[26px] leading-[30px] font-extrabold">{msg}</h1>
        <p className="text-ink-muted">ask the member who invited you for a new handshake — it takes a few seconds.</p>
      </main>
    );
  }

  let selfieUrl: string | null = null;
  if (inv.selfie_path) {
    const admin = createAdminClient();
    const signed = await admin?.storage.from("selfies").createSignedUrl(inv.selfie_path, 60 * 30);
    selfieUrl = signed?.data?.signedUrl ?? null;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-10">
      <Logo size={56} className="mx-auto text-fire" />
      <h1 className="mt-3 text-center text-[30px] leading-[34px] font-extrabold tracking-[-0.03em]">welcome to the club</h1>
      <p className="mt-1.5 mb-4 text-center text-ink-muted">members only. you got in with a handshake.</p>
      <div className="aspect-square w-full overflow-hidden rounded-[var(--radius-lg)] bg-surface-sunk">
        {selfieUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={selfieUrl} alt={`joint selfie with ${inv.inviter_name}`} className="h-full w-full object-cover" />
        )}
      </div>
      <p className="mt-4 flex items-center justify-center gap-2.5 text-[15px]">
        <Avatar name={inv.inviter_name} size={28} /> invited by <b>{inv.inviter_name}</b>
      </p>
      <div className="mt-auto pt-8">
        <SignInButton className="w-full" label="join with google" next={`/i/${code}/join`} />
        <p className="meta mt-2.5 text-center">1handshake.com/i/{code}</p>
      </div>
    </main>
  );
}
