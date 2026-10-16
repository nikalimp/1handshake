import "server-only";

export type DraftCard = { name: string; role: string; handle: string; bio_md: string };

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";

const SYSTEM = `you turn a short spoken intro into a visit card for 1handshake, a members-only club for people in tech.
rules:
- write in english, even if the intro is in another language.
- name: the person's name as they'd write it. if they didn't say it, use the google account name.
- role: what they do, 2–6 words, e.g. "founder, ai notes app" or "senior backend engineer".
- handle: lowercase latin letters, digits and underscores, 2–30 chars, based on their name.
- bio_md: markdown, first person, 300–700 characters. short paragraphs, or a "- " list for what they can help with and what they need.
  concrete over generic: keep projects, companies, numbers and cities they mention. no buzzwords, no emoji, no headings.
- don't invent facts that aren't in the intro.`;

const TOOL = {
  name: "save_card",
  description: "Save the drafted visit card.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      role: { type: "string" },
      handle: { type: "string" },
      bio_md: { type: "string" },
    },
    required: ["name", "role", "handle", "bio_md"],
  },
};

export function handleFrom(text: string) {
  const h = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  return h.length >= 2 ? h : `member_${Math.random().toString(36).slice(2, 7)}`;
}

/** Without an API key (or if the call fails) the card is the transcript as is — the guest edits it. */
export function fallbackCard(transcript: string, googleName: string, email: string): DraftCard {
  return { name: googleName, role: "", handle: handleFrom(googleName || email.split("@")[0]), bio_md: transcript.trim() };
}

export async function draftCard(transcript: string, googleName: string, email: string): Promise<DraftCard & { ai: boolean }> {
  const key = process.env.ANTHROPIC_API_KEY;
  const fallback = { ...fallbackCard(transcript, googleName, email), ai: false };
  if (!key || !transcript.trim()) return fallback;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: "tool", name: "save_card" },
        messages: [{ role: "user", content: `google account name: ${googleName || "unknown"}\n\nintro:\n${transcript.slice(0, 6000)}` }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return fallback;
    const json = (await res.json()) as { content?: { type: string; input?: Partial<DraftCard> }[] };
    const card = json.content?.find((c) => c.type === "tool_use")?.input;
    if (!card?.bio_md) return fallback;
    return {
      name: (card.name || googleName).slice(0, 80),
      role: (card.role ?? "").slice(0, 80),
      handle: handleFrom(card.handle || card.name || googleName),
      bio_md: card.bio_md.slice(0, 4000),
      ai: true,
    };
  } catch {
    return fallback;
  }
}
