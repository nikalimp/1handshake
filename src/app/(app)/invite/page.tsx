import { requireMe } from "@/lib/data";
import { InviteFlow } from "./invite-flow";

export const metadata = { title: "invite" };

// Selfie together → single-use QR for 10 minutes → live waiting screen → 🤝.
// Interaction reference: Product/prototype/invite-join.html
export default async function InvitePage() {
  const me = await requireMe();
  return <InviteFlow uid={me.id} />;
}
