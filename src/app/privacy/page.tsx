import { LegalPage } from "@/components/legal-page";

export const dynamic = "force-static";
export const metadata = { title: "Privacy Policy", description: "What 1handshake collects, why, who sees it, and your choices." };

export default function Privacy() {
  return <LegalPage name="privacy" />;
}
