import "server-only";
import { geminiJson, hasGemini } from "@/lib/gemini";

export type DraftCard = { name: string; role: string; handle: string; bio_md: string; spheres: string[]; needs: string[]; cans: string[] };

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";

const SYSTEM = `you turn a short spoken intro into a visit card for 1handshake, a members-only club for people in tech.
rules:
- write in english, even if the intro is in another language.
- name: the person's name as they'd write it. if they didn't say it, use the google account name.
- role: what they do, 2–6 words, e.g. "founder, ai notes app" or "senior backend engineer".
- handle: lowercase latin letters, digits and underscores, 2–30 chars, based on their name.
- bio_md: markdown, first person, 400–1200 characters, split into 2–4 sections. each section starts with an H2 line
  ("## " + 1–4 words, sentence case), then a short paragraph or a "- " list. pick only sections the intro has material for,
  in this order: "## About" (who they are, what they do now), "## Building" or "## Working on" (current project or company),
  "## Can help with" (list), "## Looking for" (list). no H1, no other heading levels.
  concrete over generic: keep projects, companies, numbers and cities they mention. no buzzwords, no emoji.
- spheres: 1–3 names copied exactly from the list of spheres given, the best fit first. empty if nothing fits.
- needs: up to 5 short lines (under 80 characters each) of what they're looking for — people, roles, intros, help. only what they said.
- cans: up to 5 short lines (under 80 characters each) of what they can help others with. only what they said.
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
      spheres: { type: "array", items: { type: "string" } },
      needs: { type: "array", items: { type: "string" } },
      cans: { type: "array", items: { type: "string" } },
    },
    required: ["name", "role", "handle", "bio_md", "spheres", "needs", "cans"],
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
  return { name: googleName, role: "", handle: handleFrom(googleName || email.split("@")[0]), bio_md: transcript.trim(), spheres: [], needs: [], cans: [] };
}

const CARD_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    role: { type: "STRING" },
    handle: { type: "STRING" },
    bio_md: { type: "STRING" },
    spheres: { type: "ARRAY", items: { type: "STRING" } },
    needs: { type: "ARRAY", items: { type: "STRING" } },
    cans: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["name", "role", "handle", "bio_md", "spheres", "needs", "cans"],
};

const list = (v: unknown, max: number) =>
  (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && Boolean(x.trim())).map((x) => x.trim().slice(0, 200)).slice(0, max);

const finish = (card: Partial<DraftCard> | null | undefined, googleName: string) =>
  card?.bio_md
    ? {
        name: (card.name || googleName).slice(0, 80),
        role: (card.role ?? "").slice(0, 80),
        handle: handleFrom(card.handle || card.name || googleName),
        bio_md: card.bio_md.slice(0, 4000),
        spheres: list(card.spheres, 3),
        needs: list(card.needs, 5),
        cans: list(card.cans, 5),
        ai: true,
      }
    : null;

/** Intro → card: Claude when ANTHROPIC_API_KEY is set, else Gemini (GEMINI_API_KEY), else the intro as is. */
export async function draftCard(transcript: string, googleName: string, email: string, sphereNames: string[] = []): Promise<DraftCard & { ai: boolean }> {
  const key = process.env.ANTHROPIC_API_KEY;
  const fallback = { ...fallbackCard(transcript, googleName, email), ai: false };
  if (!transcript.trim()) return fallback;
  const prompt = `google account name: ${googleName || "unknown"}\n\nspheres to pick from: ${sphereNames.join(" | ")}\n\nintro:\n${transcript.slice(0, 6000)}`;
  if (!key) {
    if (!hasGemini()) return fallback;
    const card = await geminiJson<Partial<DraftCard>>({ system: SYSTEM, prompt, schema: CARD_SCHEMA });
    return finish(card, googleName) ?? fallback;
  }
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
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return fallback;
    const json = (await res.json()) as { content?: { type: string; input?: Partial<DraftCard> }[] };
    return finish(json.content?.find((c) => c.type === "tool_use")?.input, googleName) ?? fallback;
  } catch {
    return fallback;
  }
}

const REVISE = `you edit a member's visit card on 1handshake, a club for people in tech. you get the current card (markdown)
and what the member just said about how to change it. apply the change and return the whole updated card.
keep the same rules as the card: english, first person, markdown, 400–1200 characters unless they ask otherwise,
concrete, no buzzwords, no emoji. keep everything they didn't ask to change.
always return the card organised into 2–4 sections, each starting with an H2 line ("## " + 1–4 words, sentence case)
followed by a short paragraph or a "- " list — usually "## About", "## Building", "## Can help with", "## Looking for",
only those with material. if the current card has no sections, restructure it into them. no H1, no other heading levels.
if what they said is new information rather than an instruction, weave it into the card. don't invent facts.`;

/** Spoken edit + current card → updated card markdown. Claude, else Gemini; null if neither is set up or it fails. */
export async function reviseCard(bio: string, spoken: string): Promise<string | null> {
  const prompt = `current card:\n${bio.slice(0, 4000) || "(empty)"}\n\nwhat they said:\n${spoken.slice(0, 4000)}`;
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: `${REVISE}\nreturn only the updated markdown.`, messages: [{ role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const json = (await res.json()) as { content?: { type: string; text?: string }[] };
        const text = json.content?.find((c) => c.type === "text")?.text?.trim();
        if (text) return text.slice(0, 4000);
      }
    } catch {}
  }
  if (!hasGemini()) return null;
  const out = await geminiJson<{ bio_md?: string }>({
    system: REVISE,
    prompt,
    schema: { type: "OBJECT", properties: { bio_md: { type: "STRING" } }, required: ["bio_md"] },
  });
  return out?.bio_md?.trim().slice(0, 4000) || null;
}
