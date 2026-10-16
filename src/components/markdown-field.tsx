"use client";
import { useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
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

/** Markdown textarea with a formatting toolbar and a preview tab. Shows formatting, stores plain markdown. */
export function MarkdownField({
  value,
  onChange,
  rows = 9,
  maxLength = 4000,
  label = "about",
  defaultView = "write",
  onVoice,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  maxLength?: number;
  label?: string;
  defaultView?: "write" | "preview";
  /** Voice edit: what was said → the new text (null = couldn't rewrite; the words are appended instead). */
  onVoice?: (spoken: string) => Promise<string | null>;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [view, setView] = useState<"write" | "preview">(defaultView);
  const [rewriting, setRewriting] = useState(false);
  const [undo, setUndo] = useState<string | null>(null);
  const voice = useRecorder(async (spoken) => {
    if (!onVoice) return;
    setRewriting(true);
    const before = value;
    const next = await onVoice(spoken).catch(() => null);
    onChange((next ?? `${before.trim()}${before.trim() ? "\n\n" : ""}${spoken}`).slice(0, maxLength));
    setUndo(before);
    setRewriting(false);
  }, 120);
  const listening = voice.state === "recording";
  const working = voice.state === "transcribing" || rewriting;

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
            {onVoice && voice.supported && (
              <button
                type="button"
                title="edit with your voice"
                aria-label={listening ? "stop recording" : "edit with your voice"}
                aria-pressed={listening}
                disabled={working}
                onClick={() => (listening ? voice.stop() : void voice.start())}
                className={`order-last ml-auto flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ${listening ? "bg-ink text-paper" : "bg-fire-soft text-fire-ink"} disabled:opacity-60`}
              >
                {working ? "rewriting…" : listening ? `● ${Math.floor(voice.seconds / 60)}:${String(voice.seconds % 60).padStart(2, "0")} stop` : "🎙 say it"}
              </button>
            )}
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
          <textarea
            ref={area}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            maxLength={maxLength}
            placeholder="who you are, what you do, what you need, how you can help"
            className="block w-full resize-y bg-transparent px-4 py-3 text-[15px] leading-[22px] outline-none placeholder:text-ink-muted focus-visible:outline-none"
          />
        </div>
      ) : (
        <div className="min-h-24 rounded-[var(--radius-md)] border border-dashed border-line-strong px-4 py-3">
          {value.trim() ? <Markdown source={value} /> : <p className="text-ink-muted">nothing here yet</p>}
        </div>
      )}
      {(undo !== null || voice.error) && (
        <p className="flex items-center justify-between gap-3 px-1 text-sm">
          <span className={voice.error ? "text-fire-ink" : "text-ink-muted"}>{voice.error ?? "rewritten from your voice"}</span>
          {undo !== null && !voice.error && (
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
      {onVoice && voice.supported && undo === null && !voice.error && !listening && !working && <p className="meta px-1">tip: tap 🎙 and say what to change — “add that i mentor founders”</p>}
    </div>
  );
}
