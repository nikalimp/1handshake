import { NextResponse } from "next/server";
import { geminiText, hasGemini } from "@/lib/gemini";

export const dynamic = "force-dynamic";

// Which integrations are switched on. Booleans only — no keys or values ever leave the server.
// The Gemini check makes one tiny request at most every 10 minutes per server instance.
let geminiCheck: { at: number; ok: boolean } | null = null;

export async function GET() {
  let geminiWorks: boolean | null = null;
  if (hasGemini()) {
    if (!geminiCheck || Date.now() - geminiCheck.at > 10 * 60 * 1000) {
      const reply = await geminiText({ system: "reply with the single word ok", parts: [{ text: "ping" }], timeoutMs: 15_000, temperature: 0 });
      geminiCheck = { at: Date.now(), ok: reply !== null };
    }
    geminiWorks = geminiCheck.ok;
  }
  return NextResponse.json(
    {
      gemini: { key: hasGemini(), works: geminiWorks },
      claude: Boolean(process.env.ANTHROPIC_API_KEY),
      push: Boolean(process.env.VAPID_PRIVATE_KEY),
      service_key: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
