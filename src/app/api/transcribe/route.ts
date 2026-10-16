import { NextResponse, type NextRequest } from "next/server";
import { transcribe } from "@/lib/gemini";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // ~3 minutes of compressed speech
// What browsers record → what Gemini accepts.
const mimeFor = (t: string) => {
  const base = t.split(";")[0].trim().toLowerCase();
  if (base === "audio/mp4" || base === "audio/x-m4a") return "audio/m4a";
  if (["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp3", "audio/wav", "audio/aac", "audio/m4a", "audio/flac", "audio/opus"].includes(base)) return base;
  return null;
};

/** Voice intro → text. Signed-in people only (guests are signed in with Google before they record). */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof Blob) || !file.size) return NextResponse.json({ error: "no recording" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "the recording is too long — keep it under 3 minutes" }, { status: 413 });
  const mime = mimeFor(file.type || "audio/webm");
  if (!mime) return NextResponse.json({ error: "this browser records in a format we can't read — type instead" }, { status: 415 });

  const text = await transcribe(Buffer.from(await file.arrayBuffer()).toString("base64"), mime);
  if (text === null) return NextResponse.json({ error: "couldn't make out the recording. try again or type it." }, { status: 502 });
  return NextResponse.json({ text });
}
