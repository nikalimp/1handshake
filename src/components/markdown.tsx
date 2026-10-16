import type { ReactNode } from "react";

// Markdown for visit cards and bios: # headings, paragraphs, "- " and "1. " lists, "> " quotes,
// **bold**, *italic*, ~~strike~~, `code` and [links](https://…).
// Builds React elements (no raw HTML), so a card can't inject markup.

// Underscore emphasis is left out on purpose: it would mangle handles like @anna_kim_dev.
const INLINE = /\*\*(.+?)\*\*|~~(.+?)~~|`([^`]+)`|\*([^*\s][^*]*?)\*|\[([^\]]+)\]\(((?:https?:\/\/|mailto:|\/(?!\/))[^\s)]*)\)/g;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(INLINE.source, "g"); // own copy: nested calls must not share lastIndex
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1]) out.push(<strong key={k}>{inline(m[1], k)}</strong>);
    else if (m[2]) out.push(<s key={k}>{inline(m[2], k)}</s>);
    else if (m[3]) out.push(<code key={k} className="rounded bg-surface-sunk px-1 py-0.5 font-mono text-[0.9em]">{m[3]}</code>);
    else if (m[4]) out.push(<em key={k}>{inline(m[4], k)}</em>);
    else
      out.push(
        <a key={k} href={m[6]} {...(m[6].startsWith("http") ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})} className="underline decoration-line-strong underline-offset-2 hover:decoration-current">
          {m[5]}
        </a>,
      );
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { t: "h"; level: number; text: string }
  | { t: "p"; lines: string[] }
  | { t: "ul" | "ol"; items: string[] }
  | { t: "quote"; lines: string[] }
  | { t: "hr" };

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  for (const raw of lines) {
    const line = raw.trimEnd();
    const prev = blocks[blocks.length - 1];
    let m: RegExpExecArray | null;
    if (!line.trim()) {
      blocks.push({ t: "p", lines: [] }); // paragraph break marker, dropped below if empty
    } else if ((m = /^(#{1,3})(?!#)\s*(\S.*)$/.exec(line))) {
      blocks.push({ t: "h", level: m[1].length, text: m[2] });
    } else if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push({ t: "hr" });
    } else if ((m = /^\s*[-*+]\s+(.*)$/.exec(line))) {
      if (prev?.t === "ul") prev.items.push(m[1]);
      else blocks.push({ t: "ul", items: [m[1]] });
    } else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
      if (prev?.t === "ol") prev.items.push(m[1]);
      else blocks.push({ t: "ol", items: [m[1]] });
    } else if ((m = /^>\s?(.*)$/.exec(line))) {
      if (prev?.t === "quote") prev.lines.push(m[1]);
      else blocks.push({ t: "quote", lines: [m[1]] });
    } else if (prev?.t === "p" && prev.lines.length > 0) {
      prev.lines.push(line);
    } else {
      blocks.push({ t: "p", lines: [line] });
    }
  }
  return blocks.filter((b) => b.t !== "p" || b.lines.length > 0);
}

const withBreaks = (lines: string[], key: string) =>
  lines.map((l, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {inline(l, `${key}-${i}`)}
    </span>
  ));

export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {parse(source).map((b, n) => {
        const k = String(n);
        switch (b.t) {
          case "h":
            return b.level === 1 ? (
              <h2 key={k} className="text-[22px] leading-7 font-extrabold tracking-[-0.02em]">{inline(b.text, k)}</h2>
            ) : b.level === 2 ? (
              <h3 key={k} className="text-lg leading-6 font-bold">{inline(b.text, k)}</h3>
            ) : (
              <h4 key={k} className="font-bold">{inline(b.text, k)}</h4>
            );
          case "ul":
            return (
              <ul key={k} className="flex list-disc flex-col gap-1 pl-5 marker:text-ink-muted">
                {b.items.map((it, i) => <li key={i}>{inline(it, `${k}-${i}`)}</li>)}
              </ul>
            );
          case "ol":
            return (
              <ol key={k} className="flex list-decimal flex-col gap-1 pl-5 marker:text-ink-muted">
                {b.items.map((it, i) => <li key={i}>{inline(it, `${k}-${i}`)}</li>)}
              </ol>
            );
          case "quote":
            return (
              <blockquote key={k} className="border-l-[3px] border-fire pl-3 text-ink-muted">
                {withBreaks(b.lines, k)}
              </blockquote>
            );
          case "hr":
            return <hr key={k} className="border-line" />;
          default:
            return <p key={k}>{withBreaks(b.lines, k)}</p>;
        }
      })}
    </div>
  );
}

/** Markdown → plain text, for short previews (connect cards, meta descriptions). */
export function plainText(source: string) {
  return source
    .replace(/^#{1,3}(?!#)\s*/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, "· ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(\*\*|~~|`)(.+?)\1/g, "$2")
    .replace(/\*([^*\s][^*]*?)\*/g, "$1")
    .replace(/^(-{3,}|\*{3,})$/gm, "")
    .trim();
}
