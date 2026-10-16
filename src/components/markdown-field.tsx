"use client";
import { useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
import { Progress } from "@/components/progress";
import { useRecorder } from "@/lib/use-recorder";

type Edit = { value: string; start: number; end: number };

/** Wraps the selection (or a placeholder word) with marks, e.g. **bold**. Toggles off if already wrapped. */
function wrap({ value, start, end }: Edit, left: string, right = left, placeholder = "text"): Edit {
  const before = value.slice(0, start);
  const after = value.slice(end);
  if (before.endsWith(left) && after.startsWith(right)) {
    return { value: before.slice(0, -left.length) + value.slice(start, end) + after.slice(right.length), start: start - left.length, end: end - left.length };
  }
  const text = value.slice(start, end) || placeholder;
  return { value: before + left + text + right + after, start: start + left.length, end: start + left.length + text.length };
}

/** Adds (or removes) a prefix on every selected line: "- ", "1. ", "> ", "## ". */
function prefixLines({ value, start, end }: Edit, prefix: (i: number) => string, test: RegExp): Edit {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = value.indexOf("\n", end) === -1 ? value.length : value.indexOf("\n", end);
  const lines = value.slice(lineStart, lineEnd).split("\n");
  const all = lines.every((l) => test.test(l));
  const next = lines.map((l, i) => (all ? l.replace(test, "") : prefix(i) + l.replace(/^(#{1,3}\s+|>\s?|\s*[-*+]\s+|\s*\d+[.)]\s+)/, ""))).join("\n");
  const block = value.slice(0, lineStart) + next + value.slice(lineEnd);
  return { value: block, start: lineStart, end: lineStart + next.length };
}

const TOOLS: { label: string; title: string; run: (e: Edit) => Edit; className?: string }[] = [
  { label: "B", title: "bold", run: (e) => wrap(e, "**"), className: "font-extrabold" },
  { label: "I", title: "italic", run: (e) => wrap(e, "*"), className: "italic font-serif" },
  { label: "S", title: "strikethrough", run: (e) => wrap(e, "~~"), className: "line-through" },
  { label: "H", title: "heading", run: (e) => prefixLines(e, () => "## ", /^##\s+/) },
  { label: "•", title: "bulleted list", run: (e) => prefixLines(e, () => "- ", /^\s*[-*+]\s+/) },
  { label: "1.", title: "numbered list", run: (e) => prefixLines(e, (i) => `${i + 1}. `, /^\s*\d+[.)]\s+/), className: "font-mono text-[13px]" },
  { label: "❝", title: "quote", run: (e) => prefixLines(e, () => "> ", /^>\s?/) },
  {
    label: "link",
    title: "link",
    run: (e) => {
      const text = e.value.slice(e.start, e.end) || "link text";
      const value = e.value.slice(0, e.start) + `[${text}](https://)` + e.value.slice(e.end);
      const urlStart = e.start + text.length + 3;
      return { value, start: urlStart, end: urlStart + 8 };
    },
    className: "text-sm underline underline-offset-2",
  },
];

const TIDY =
  "organise my card into clear sections with H2 headings. keep my facts and my wording as much as possible, fix grammar and typos, don't add anything new.";

/** Markdown textarea with a formatting toolbar and a preview tab. Shows formatting, stores plain markdown. */
export function MarkdownField({
  value,
  onChange,
  rows = 9,
  maxLength = 4000,
  label = "about",
  defaultView = "write",
  onRewrite,
  placeholder = "who you are, what you do, what you need, how you can help",
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  maxLength?: number;
  label?: string;
  defaultView?: "write" | "preview";
  /** AI edit: an instruction (spoken or built in) → the new text, or null if it couldn't rewrite. Enables 🎙 and ✨. */
  onRewrite?: (instruction: string) => Promise<string | null>;
  placeholder?: string;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [view, setView] = useState<"write" | "preview">(defaultView);
  const [rewriting, setRewriting] = useState<{ at: number; voice: boolean } | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const rewrite = async (instruction: string, voice: boolean, fallback?: string) => {
    if (!onRewrite) return;
    setAiError(null);
    setRewriting({ at: Date.now(), voice });
    const before = value;
    const next = await onRewrite(instruction).catch(() => null);
    setRewriting(null);
    if (next === null && fallback === undefined) return setAiError("couldn't rewrite right now. try again in a minute.");
    onChange((next ?? `${before.trim()}${before.trim() ? "\n\n" : ""}${fallback}`).slice(0, maxLength));
    setUndo(before);
  };
  const rec = useRecorder((spoken) => void rewrite(spoken, true, spoken), 120);
  const listening = rec.phase === "recording";
  const working = rec.phase === "uploading" || rec.phase === "transcribing" || rewriting !== null;

  const apply = (run: (e: Edit) => Edit) => {
    const el = area.current;
    if (!el) return;
    const next = run({ value, start: el.selectionStart, end: el.selectionEnd });
    if (next.value.length > maxLength) return;
    onChange(next.value);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.start, next.end);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="meta">{label}</span>
        <div className="flex gap-1 rounded-full bg-surface-sunk p-1 text-sm font-semibold" role="tablist">
          {(["write", "preview"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-full px-3 py-0.5 ${view === v ? "bg-surface shadow-sm" : "text-ink-muted"}`}>
              {v}
            </button>
          ))}
        </div>
      </div>
      {view === "write" ? (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface focus-within:border-line-strong">
          <div className="flex flex-wrap gap-0.5 border-b border-line p-1" role="toolbar" aria-label="formatting">
            {TOOLS.map((t) => (
              <button
                key={t.title}
                type="button"
                title={t.title}
                aria-label={t.title}
                onMouseDown={(e) => e.preventDefault()} // keep the selection in the textarea
                onClick={() => apply(t.run)}
                className={`grid h-8 min-w-8 place-items-center rounded-[var(--radius-sm)] px-2 text-[15px] hover:bg-surface-sunk active:bg-surface-sunk ${t.className ?? ""}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {onRewrite && (
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-2 py-2">
              {working ? (
                <div className="w-full px-1 py-0.5">
                  {rec.phase === "uploading" && <Progress label="sending your voice" from={0} to={15} estMs={2500} startedAt={rec.phaseAt} real={rec.upload} />}
                  {rec.phase === "transcribing" && <Progress label="turning speech into text" from={15} to={55} estMs={rec.transcribeMs} startedAt={rec.phaseAt} />}
                  {rewriting && (
                    <Progress
                      label={rewriting.voice ? "rewriting your card" : "tidying into sections"}
                      from={rewriting.voice ? 55 : 0}
                      to={99}
                      estMs={7000}
                      startedAt={rewriting.at}
                    />
                  )}
                </div>
              ) : (
                <>
                  {rec.supported && (
                    <button
                      type="button"
                      aria-label={listening ? "stop recording" : "edit with your voice"}
                      aria-pressed={listening}
                      onClick={() => (listening ? rec.stop() : void rec.start())}
                      className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ${listening ? "bg-ink text-paper" : "bg-fire-soft text-fire-ink"}`}
                    >
                      {listening ? `● ${Math.floor(rec.seconds / 60)}:${String(rec.seconds % 60).padStart(2, "0")} · stop` : "🎙 say what to change"}
                    </button>
                  )}
                  {!listening && value.trim().length > 40 && (
                    <button type="button" onClick={() => void rewrite(TIDY, false)} className="flex h-8 items-center gap-1.5 rounded-full bg-surface-sunk px-3 text-sm font-semibold">
                      ✨ tidy into sections
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          <textarea
            ref={area}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            maxLength={maxLength}
            placeholder={placeholder}
            className="block w-full resize-y bg-transparent px-4 py-3 text-[15px] leading-[22px] outline-none placeholder:text-ink-muted focus-visible:outline-none"
          />
        </div>
      ) : (
        <div className="min-h-24 rounded-[var(--radius-md)] border border-dashed border-line-strong px-4 py-3">
          {value.trim() ? <Markdown source={value} /> : <p className="text-ink-muted">nothing here yet</p>}
        </div>
      )}
      {(undo !== null || rec.error || aiError) && !working && (
        <p className="flex items-center justify-between gap-3 px-1 text-sm">
          <span className={rec.error || aiError ? "text-fire-ink" : "text-ink-muted"}>{rec.error ?? aiError ?? "rewritten by ai — check it before saving"}</span>
          {undo !== null && !rec.error && !aiError && (
            <button
              type="button"
              className="font-semibold underline underline-offset-2"
              onClick={() => {
                onChange(undo);
                setUndo(null);
              }}
            >
              undo
            </button>
          )}
        </p>
      )}
    </div>
  );
}
