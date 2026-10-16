import "server-only";

// Google Gemini (free tier in Google AI Studio): voice → text, intro → card, matches.
// Set GEMINI_API_KEY; GEMINI_MODEL picks the model. If a model isn't available on the key,
// the next one in the list is tried.

const MODELS = [process.env.GEMINI_MODEL, "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"].filter((m): m is string => Boolean(m));
const API = "https://generativelanguage.googleapis.com/v1beta/models";

export const hasGemini = () => Boolean(process.env.GEMINI_API_KEY);

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

/** One request. Returns the model's text, or null on any failure (callers fall back). */
export async function geminiText(opts: { system: string; parts: Part[]; schema?: object; timeoutMs?: number; temperature?: number }): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts: opts.parts }],
    generation_config: {
      temperature: opts.temperature ?? 0.3,
      ...(opts.schema ? { response_mime_type: "application/json", response_schema: opts.schema } : {}),
    },
  });
  for (const model of [...new Set(MODELS)]) {
    try {
      const res = await fetch(`${API}/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
      });
      if (res.status === 404 || res.status === 400) {
        const err = await res.text();
        // Unknown or unavailable model → try the next one; a bad request for other reasons → give up.
        if (res.status === 404 || /model|not found|not supported/i.test(err)) continue;
        return null;
      }
      if (!res.ok) return null;
      const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      return text.trim() || null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Same, parsed as JSON (with a response schema). */
export async function geminiJson<T>(opts: { system: string; prompt: string; schema: object; timeoutMs?: number }): Promise<T | null> {
  const text = await geminiText({ system: opts.system, parts: [{ text: opts.prompt }], schema: opts.schema, timeoutMs: opts.timeoutMs });
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Speech → text, in the language spoken. */
export async function transcribe(audioBase64: string, mimeType: string): Promise<string | null> {
  return geminiText({
    system:
      "you transcribe a short voice intro for a networking club. return only the words spoken, in the language spoken, with normal punctuation and capitalisation. no comments, no labels, no timestamps. drop filler words like um and uh. if there is no speech, return an empty string.",
    parts: [{ text: "transcribe this recording." }, { inline_data: { mime_type: mimeType, data: audioBase64 } }],
    timeoutMs: 45_000,
    temperature: 0,
  });
}
