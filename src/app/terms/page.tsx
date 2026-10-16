import { LegalPage } from "@/components/legal-page";

export const dynamic = "force-static";
export const metadata = { title: "Terms of Service", description: "The rules of 1handshake, a members-only networking club for people in tech." };

export default function Terms() {
  return <LegalPage name="terms" />;
}
