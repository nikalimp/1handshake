"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { type City, CityPicker } from "@/components/city-picker";
import { Confetti } from "@/components/confetti";
import { Logo } from "@/components/logo";
import { ListField } from "@/components/list-field";
import { MarkdownField } from "@/components/markdown-field";
import { type Sphere, SpherePicker } from "@/components/sphere-picker";
import { SITE_HOST } from "@/lib/env";
import { fileToSquareJpeg } from "@/lib/image";
import { MAX_NEEDS } from "@/lib/needs";
import { createClient } from "@/lib/supabase/client";
import { joinClub, makeCard, markStep } from "./actions";

type Step = "about" | "drafting" | "card" | "in";

const PROMPTS = ["who you are", "what you do", "what you need", "what you can help with"];

export function JoinFlow({ code, uid, inviterName, defaults, guess, serverVoice, spheres }: { code: string; uid: string; inviterName: string; defaults: { name: string; handle: string }; guess: City | null; serverVoice: boolean; spheres: Sphere[] }) {
  const [step, setStep] = useState<Step>("about");
  const [transcript, setTranscript] = useState("");
  const [card, setCard] = useState<CardFields>({ name: defaults.name, role: "", handle: defaults.handle, bio_md: "", spheres: [], needs: [], cans: [] });
  const [ai, setAi] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void markStep(code, "about");
  }, [code]);

  const draft = async () => {
    setError(null);
    setStep("drafting");
    const res = await makeCard(code, transcript);
    if ("error" in res) {
      setError(res.error);
      setStep("about");
      return;
    }
    setCard({ name: res.name || defaults.name, role: res.role, handle: res.handle || defaults.handle, bio_md: res.bio_md, spheres: res.sphereIds, needs: res.needs, cans: res.cans });
    setAi(res.ai);
    setStep("card");
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-8 pb-10">
      <Logo size={28} className="text-ink" />
      {step === "about" && <AboutStep transcript={transcript} setTranscript={setTranscript} onNext={draft} error={error} serverVoice={serverVoice} />}
      {step === "drafting" && (
        <div className="mt-24 flex flex-col items-center gap-4 text-center">
          <div className="h-24 w-full animate-pulse rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-ai)]" />
          <p className="font-semibold">ai is drafting your card…</p>
        </div>
      )}
      {step === "card" && (
        <CardStep code={code} uid={uid} card={card} setCard={setCard} ai={ai} guess={guess} spheres={spheres} onBack={() => setStep("about")} onJoined={() => setStep("in")} />
      )}
      {step === "in" && <YoureIn inviterName={inviterName} />}
    </main>
  );
}

// --- Step 1: tell us about yourself ---------------------------------------------------------

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function recognitionCtor() {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
function getRecognition(): Recognition | null {
  const Ctor = recognitionCtor();
  return Ctor ? new Ctor() : null;
}
const noSubscribe = () => () => {};

function AboutStep({
  transcript,
  setTranscript,
  onNext,
  error,
  serverVoice,
}: {
  transcript: string;
  setTranscript: (f: (t: string) => string) => void;
  onNext: () => void;
  error: string | null;
  serverVoice: boolean;
}) {
  const rec = useRef<Recognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  // Voice: recorded and transcribed on the server (Gemini) when it's set up, else the browser's own
  // speech recognition (Chrome, Safari). Typing works everywhere.
  const recorderOk = useSyncExternalStore(noSubscribe, () => serverVoice && typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia), () => false);
  const browserOk = useSyncExternalStore(noSubscribe, () => recognitionCtor() !== null, () => false);
  const supported = recorderOk || browserOk;

  useEffect(
    () => () => {
      rec.current?.stop();
      if (recorder.current?.state === "recording") recorder.current.stop();
    },
    [],
  );
  useEffect(() => {
    if (!listening || !recorderOk) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [listening, recorderOk]);
  useEffect(() => {
    if (seconds >= 180 && recorder.current?.state === "recording") recorder.current.stop();
  }, [seconds]);

  const record = async () => {
    setVoiceError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setVoiceError("microphone is off — allow it in the browser, or type below");
      return;
    }
    const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
    const r = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32000 });
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setListening(false);
      setSeconds(0);
      const blob = new Blob(chunks, { type: r.mimeType || type || "audio/webm" });
      if (blob.size < 2000) return;
      setBusy(true);
      try {
        const body = new FormData();
        body.append("audio", blob, "intro");
        const res = await fetch("/api/transcribe", { method: "POST", body });
        const json = (await res.json()) as { text?: string; error?: string };
        if (json.text) setTranscript((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${json.text!.trim()}`);
        else setVoiceError(json.error ?? "couldn't make out the recording. try again or type it.");
      } catch {
        setVoiceError("couldn't send the recording. check the connection and try again.");
      } finally {
        setBusy(false);
      }
    };
    recorder.current = r;
    r.start();
    setListening(true);
  };

  const toggle = () => {
    if (recorderOk) {
      if (listening) recorder.current?.stop();
      else void record();
      return;
    }
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = getRecognition();
    if (!r) return;
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let finals = "";
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finals += res[0].transcript;
        else live += res[0].transcript;
      }
      if (finals) setTranscript((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${finals.trim()}`);
      setInterim(live);
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
    };
    r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };

  return (
    <section className="flex flex-1 flex-col">
      <h1 className="mt-8 text-[30px] leading-[34px] font-extrabold tracking-[-0.03em]">tell us about yourself</h1>
      <p className="mt-1.5 text-ink-muted">just talk for a minute. we&apos;ll turn it into your card.</p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {PROMPTS.map((p) => (
          <li key={p} className="rounded-full bg-surface-sunk px-3 py-1.5 text-sm">
            {p}
          </li>
        ))}
      </ul>

      {supported && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            aria-pressed={listening}
            aria-label={listening ? "stop recording" : "start recording"}
            className={`grid h-24 w-24 place-items-center rounded-full transition-transform active:scale-95 ${listening ? "bg-ink text-paper" : "bg-fire text-on-fire"}`}
          >
            {listening ? (
              <span className="h-7 w-7 rounded-md bg-current" />
            ) : (
              <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            )}
          </button>
          <span className="meta">
            {busy
              ? "turning your voice into text…"
              : listening
                ? recorderOk
                  ? `recording ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} · tap to stop`
                  : "listening… tap to stop"
                : "tap to record · or type below"}
          </span>
          {voiceError && <span className="text-sm text-fire-ink">{voiceError}</span>}
        </div>
      )}

      <label className="mt-6 flex flex-col gap-2">
        <span className="meta">transcript</span>
        <textarea
          value={transcript + (interim ? ` ${interim}` : "")}
          onChange={(e) => setTranscript(() => e.target.value)}
          rows={7}
          placeholder="hi, i'm anna. i'm building an ai notes app for founders in tbilisi. looking for a backend engineer and early users. happy to help with product design and fundraising decks."
          className="w-full resize-y rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3 text-[15px] leading-[22px] outline-none placeholder:text-ink-muted/70 focus:border-line-strong"
        />
      </label>
      {error && (
        <p role="alert" className="mt-3 rounded-[var(--radius-md)] bg-fire-soft px-4 py-3 text-sm text-fire-ink">
          {error}
        </p>
      )}
      <div className="mt-auto pt-6">
        <Button className="w-full" disabled={transcript.trim().length < 20 || listening || busy} onClick={onNext}>
          make my card
        </Button>
      </div>
    </section>
  );
}

// --- Step 2: your card -------------------------------------------------------------------------

type CardFields = { name: string; role: string; handle: string; bio_md: string; spheres: number[]; needs: string[]; cans: string[] };

function CardStep({
  code,
  uid,
  card,
  setCard,
  ai,
  guess,
  spheres,
  onBack,
  onJoined,
}: {
  code: string;
  uid: string;
  card: CardFields;
  setCard: (f: (c: CardFields) => CardFields) => void;
  ai: boolean;
  guess: City | null;
  spheres: Sphere[];
  onBack: () => void;
  onJoined: () => void;
}) {
  const [supabase] = useState(createClient);
  const file = useRef<HTMLInputElement>(null);
  const [avatar, setAvatar] = useState<{ path: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [city, setCity] = useState<City | null>(guess);
  const [birth, setBirth] = useState("");
  const [agree, setAgree] = useState(false);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [pending, startTransition] = useTransition();

  // What still blocks joining. The button stays clickable and says what's missing,
  // instead of sitting grey without a reason.
  const missing = [
    !card.name.trim() && ["name", "your name"],
    !card.role.trim() && ["role", "what you do"],
    card.handle.length < 2 && ["handle", "a handle"],
    !city && ["city", "your city"],
    !agree && ["agree", "the agreement tick"],
  ].filter((m): m is [string, string] => Boolean(m));
  const bad = (k: string) => checked && missing.some(([key]) => key === k);
  const ring = (k: string) => (bad(k) ? "ring-2 ring-fire ring-offset-2 ring-offset-surface" : "");
  const notice = checked && missing.length ? `almost there — add ${missing.map(([, label]) => label).join(", ")}.` : error;

  const set = (k: "name" | "role") => (e: { target: { value: string } }) => setCard((c) => ({ ...c, [k]: e.target.value }));

  const pickPhoto = async (f: File) => {
    setUploading(true);
    setError(null);
    try {
      const blob = await fileToSquareJpeg(f, 640);
      const path = `${uid}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      if (avatar) {
        URL.revokeObjectURL(avatar.url);
        void supabase.storage.from("avatars").remove([avatar.path]);
      }
      setAvatar({ path, url: URL.createObjectURL(blob) });
    } catch {
      setError("couldn't upload the photo. try another one.");
    } finally {
      setUploading(false);
    }
  };

  const join = () => {
    setChecked(true);
    if (missing.length) return;
    startTransition(async () => {
      setError(null);
      const res = await joinClub({ code, ...card, city_id: city?.id ?? 0, birth_date: birth || null, avatar_path: avatar?.path ?? null, agreed: agree });
      if ("error" in res) setError(res.error);
      else onJoined();
    });
  };

  const field = "w-full rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3 outline-none focus:border-line-strong";

  return (
    <section className="flex flex-col">
      <h1 className="mt-8 text-[30px] leading-[34px] font-extrabold tracking-[-0.03em]">your card</h1>
      <p className="mt-1.5 text-ink-muted">this is what members and search engines will see. tweak anything.</p>

      <article className={`mt-5 flex flex-col gap-4 rounded-[var(--radius-lg)] bg-surface p-5 ${ai ? "shadow-[var(--shadow-ai)]" : "shadow-[var(--shadow-card)]"}`}>
        <button type="button" onClick={() => file.current?.click()} className="relative w-fit" aria-label="add a photo">
          {avatar ? (
            <Avatar name={card.name} size={84} src={avatar.url} />
          ) : (
            <span className="grid h-[84px] w-[84px] place-items-center rounded-full border-[1.5px] border-dashed border-line-strong text-sm font-semibold text-ink-muted">
              {uploading ? "…" : "+ photo"}
            </span>
          )}
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void pickPhoto(f);
          }}
        />
        <label className="flex flex-col gap-1.5">
          <span className="meta">name</span>
          <input
            value={card.name}
            onChange={set("name")}
            placeholder="your name"
            maxLength={80}
            className={`rounded-[var(--radius-sm)] bg-surface-sunk px-3 py-2 text-[24px] leading-8 font-extrabold tracking-[-0.02em] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--line-strong)] ${ring("name")}`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="meta">what you do</span>
          <input
            value={card.role}
            onChange={set("role")}
            placeholder="e.g. founder, ai notes app"
            maxLength={80}
            className={`rounded-[var(--radius-sm)] bg-surface-sunk px-3 py-2.5 text-[17px] font-semibold outline-none placeholder:font-normal placeholder:text-ink-muted focus:shadow-[inset_0_0_0_1.5px_var(--line-strong)] ${ring("role")}`}
          />
        </label>

        <MarkdownField value={card.bio_md} onChange={(v) => setCard((c) => ({ ...c, bio_md: v }))} defaultView="preview" />
      </article>

      <section className="mt-4 flex flex-col gap-5 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-card)]" aria-label="what you work in, need and can">
        <div className="flex flex-col gap-3">
          <div>
            <p className="font-semibold">what you work in</p>
            <p className="text-sm text-ink-muted">up to 3 · ★ is your main one · members filter the graph by it</p>
          </div>
          <SpherePicker value={card.spheres} onChange={(v) => setCard((c) => ({ ...c, spheres: v }))} spheres={spheres} />
        </div>
        <ListField label="i need" hint="members see it, and connect shows you people who can help" items={card.needs} onChange={(v) => setCard((c) => ({ ...c, needs: v }))} max={MAX_NEEDS} placeholder="e.g. a backend engineer" />
        <ListField label="i can" items={card.cans} onChange={(v) => setCard((c) => ({ ...c, cans: v }))} max={MAX_NEEDS} placeholder="e.g. review your pitch deck" />
      </section>

      <div className="mt-5 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="meta">handle · {SITE_HOST}/@{card.handle || "you"}</span>
          <div className={`flex items-center rounded-[var(--radius-md)] border border-line bg-surface pl-4 focus-within:border-line-strong ${ring("handle")}`}>
            <span className="text-ink-muted">@</span>
            <input value={card.handle} onChange={(e) => setCard((c) => ({ ...c, handle: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))} maxLength={30} className="w-full bg-transparent px-1 py-3 outline-none" />
          </div>
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="meta">city</span>
          <CityPicker value={city} onChange={setCity} className={`${field} ${ring("city")}`} note={guess && city?.id === guess.id ? "guessed from your connection" : null} />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="meta">birthday · only you see it</span>
          <input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} max={today} className={field} />
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className={`mt-0.5 h-5 w-5 shrink-0 rounded accent-[var(--fire)] ${ring("agree")}`} />
          <span>
            i agree to the{" "}
            <Link href="/terms" target="_blank" className="underline underline-offset-2">
              terms
            </Link>{" "}
            and the{" "}
            <Link href="/privacy" target="_blank" className="underline underline-offset-2">
              privacy policy
            </Link>
            . my card is public; my network stays private.
          </span>
        </label>
        {notice && (
          <p role="alert" className="rounded-[var(--radius-md)] bg-fire-soft px-4 py-3 text-sm text-fire-ink">
            {notice}
          </p>
        )}
        {/* Looks inactive until everything required (consent included) is in place, but a tap still explains what's missing. */}
        <Button className={`w-full ${missing.length ? "opacity-40" : ""}`} aria-disabled={missing.length > 0} disabled={pending || uploading} onClick={join}>
          {pending ? "joining…" : "join the club"}
        </Button>
        <Button variant="ghost" size="sm" className="self-center" onClick={onBack} disabled={pending}>
          back to my intro
        </Button>
      </div>
    </section>
  );
}

// --- Step 3: you're in ------------------------------------------------------------------------

function YoureIn({ inviterName }: { inviterName: string }) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace("/profile"), 2800);
    return () => clearTimeout(t);
  }, [router]);
  return (
    <>
      <Confetti />
      <section className="mt-24 flex flex-col items-center gap-4 text-center">
        <span className="text-5xl">🤝</span>
        <h1 className="text-[34px] leading-[38px] font-extrabold tracking-[-0.03em]">you&apos;re in</h1>
        <p className="text-ink-muted">
          welcome to 1handshake. you and {inviterName.split(" ")[0]} are connected.
        </p>
        <p className="meta mt-6">opening your profile…</p>
      </section>
    </>
  );
}
