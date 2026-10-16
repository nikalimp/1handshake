import { redirect } from "next/navigation";
import { hasGemini } from "@/lib/gemini";
import { guessCity } from "@/lib/geo";
import { InviteProblem } from "@/components/invite-problem";
import { handleFrom } from "@/lib/ai-card";
import { getMe } from "@/lib/data";
import { inviteProblem, openInvite } from "@/lib/invites";
import { createClient } from "@/lib/supabase/server";
import { JoinFlow } from "./join-flow";

export const metadata = { title: "tell us about yourself", robots: { index: false } };

// After Google sign-in: voice → transcript → AI card → accept_invite() → confetti → feed.
// Interaction reference: Product/prototype/invite-join.html
export default async function Join(props: PageProps<"/i/[code]/join">) {
  const { code } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) redirect(`/i/${code}`);
  if (await getMe()) redirect(`/i/${code}`); // members get an instant handshake there

  const inv = await openInvite(code);
  const problem = inviteProblem(inv);
  if (!inv || problem) return <InviteProblem title={problem ?? "this code doesn't exist"} />;

  const [guess, { data: spheres }] = await Promise.all([
    guessCity(supabase),
    supabase.from("spheres").select("id, parent_id, name").order("id").returns<{ id: number; parent_id: number | null; name: string }[]>(),
  ]);
  const meta = user.user_metadata as { full_name?: string; name?: string };
  const googleName = meta.full_name ?? meta.name ?? "";

  return (
    <JoinFlow
      code={code}
      uid={user.id}
      inviterName={inv.inviter_name ?? "your inviter"}
      guess={guess}
      serverVoice={hasGemini()}
      spheres={spheres ?? []}
      defaults={{ name: googleName, handle: handleFrom(googleName || (user.email ?? "").split("@")[0]) }}
    />
  );
}
