import { LegalDraft } from "@/components/legal-draft";

export const metadata = { title: "privacy policy" };

export default function Privacy() {
  return (
    <LegalDraft title="privacy policy">
      <p>what we keep: your google account email, your visit card (name, role, bio, photo, city), your birthday (only you see it), your handshakes and requests, and the joint selfie from your invite.</p>
      <p>where: in a postgres database and file storage in the eu (frankfurt). photos are re-encoded on your device before upload, which removes location and camera metadata.</p>
      <p>ai: when you record or type your intro, it&apos;s sent to google gemini to turn speech into text and draft your card; your &quot;i need / i can&quot; lines are used the same way to find matches. we don&apos;t keep the recording.</p>
      <p>who sees what: your visit card is public. your connections are visible to members only when you keep &quot;open to network&quot; on. your birthday is never shown to others.</p>
      <p>your rights: export everything or delete your account from your profile. deletion erases your personal data; the anonymous node stays.</p>
    </LegalDraft>
  );
}
