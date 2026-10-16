import "server-only";
import { createHash } from "node:crypto";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
export type Side = { needs: string[]; cans: string[] };
export type Candidate = Side & { id: string; role: string };
/** person id → one short line on why they match */
export type Matches = Record<string, string>;

const MODEL = process.env.ANTHROPIC_MATCH_MODEL ?? "claude-haiku-5-5";

// --- Keywords: the fallback without an API key -------------------------------------------------
const STOP = new Set(
  "the and for with you your our who what that this from into about some any can need want looking help someone people person team work working find get make build good great new more less like also just".split(" "),
);
const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-zа-яё0-9+#]+/i)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => w.replace(/(ing|ers|er|es|s)$/u, "") || w);

function keywordMatches(me: Side, people: Candidate[]): Matches {
  const out: Matches = {};
  for (const p of people) {
    let best: { score: number; line: string } | null = null;
    const theirCan = [...p.cans, p.role];
    for (const need of me.needs) {
      const nw = new Set(words(need));
      for (const can of theirCan) {
        const score = words(can).filter((w) => nw.has(w)).length;
        if (score && (!best || score > best.score)) best = { score, line: `you need ${need} → ${can === p.role ? `they're ${/^[aeiou]/i.test(can) ? "an" : "a"} ${can}` : `they can: ${can}`}` };
      }
    }
    for (const can of me.cans) {
      const cw = new Set(words(can));
      for (const need of p.needs) {
        const score = words(need).filter((w) => cw.has(w)).length;
        if (score && (!best || score > best.score)) best = { score, line: `they need ${need} → you can: ${can}` };
      }
    }
    if (best) out[p.id] = best.line;
  }
  return out;
}

// --- Claude ----------------------------------------------------------------------------------------
const SYSTEM = `you match members of 1handshake, a club for people in tech.
given what "me" needs and can do, and a list of people (their role, needs and offers), pick only clear, useful matches:
someone who can help with one of my needs, or who needs something I can do. skip vague or weak overlaps.
for each match write one short lowercase line (max 90 characters) saying why, e.g. "they hire ios devs · you're looking for an ios role".`;

const TOOL = {
  name: "save_matches",
  description: "Save the matches.",
  input_schema: {
    type: "object",
    properties: {
      matches: {
        type: "array",
        items: { type: "object", properties: { id: { type: "string" }, why: { type: "string" } }, required: ["id", "why"] },
      },
    },
    required: ["matches"],
  },
};

async function claudeMatches(me: Side, people: Candidate[], key: string): Promise<Matches | null> {
  const payload = {
    me,
    people: people.map((p, i) => ({ id: String(i), role: p.role, needs: p.needs, cans: p.cans })),
  };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: "tool", name: "save_matches" },
        messages: [{ role: "user", content: JSON.stringify(payload) }],
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { type: string; input?: { matches?: { id: string; why: string }[] } }[] };
    const list = data.content?.find((c) => c.type === "tool_use")?.input?.matches ?? [];
    const out: Matches = {};
    for (const m of list) {
      const p = people[Number(m.id)];
      if (p && typeof m.why === "string") out[p.id] = m.why.slice(0, 120);
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Who among these people matches my needs and offers. Claude when there's a key, keywords otherwise.
 * Results are cached per member until any input changes.
 */
export async function findMatches(supabase: Supabase, meId: string, me: Side, people: Candidate[]): Promise<Matches> {
  const withData = people.filter((p) => p.needs.length || p.cans.length || p.role);
  if (!(me.needs.length || me.cans.length) || !withData.length) return {};
  const key = process.env.ANTHROPIC_API_KEY;
  const hash = createHash("sha256")
    .update(JSON.stringify({ v: 1, ai: Boolean(key), me, people: withData }))
    .digest("hex");

  const { data: cached } = await supabase.from("match_cache").select("input_hash, result").eq("profile_id", meId).maybeSingle<{ input_hash: string; result: Matches }>();
  if (cached?.input_hash === hash) return cached.result;

  const ai = key ? await claudeMatches(me, withData, key) : null;
  const result = ai ?? keywordMatches(me, withData);
  // A failed AI call isn't cached: next visit tries again.
  if (!key || ai) await supabase.from("match_cache").upsert({ profile_id: meId, input_hash: hash, result, created_at: new Date().toISOString() });
  return result;
}
