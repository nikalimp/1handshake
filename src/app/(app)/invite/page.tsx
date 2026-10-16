import { ScreenTitle } from "@/components/screen-title";

export const metadata = { title: "invite" };

// Next build step: selfie → create_invite() → QR with 5-minute timer → realtime waiting screen.
// Interaction reference: Product/prototype/invite-join.html
export default function InvitePage() {
  return (
    <>
      <ScreenTitle title="invite" />
      <p className="meta px-0.5">selfie + qr flow comes in the next build step</p>
    </>
  );
}
