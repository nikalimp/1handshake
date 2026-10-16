import type { ReactNode } from "react";

// Tiny markdown for visit cards: headings, paragraphs, "- " lists, **bold**, *italic*, [links](https://…).
// Builds React elements (no raw HTML), so a card can't inject markup.

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1]) out.push(<strong key={k}>{m[1]}</strong>);
    else if (m[2]) out.push(<em key={k}>{m[2]}</em>);
    else
      out.push(
        <a key={k} href={m[4]} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-line-strong underline-offset-2">
          {m[3]}
        </a>,
      );
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  const blocks = source.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {blocks.map((block, b) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-*] /.test(l))) {
          return (
            <ul key={b} className="flex list-disc flex-col gap-1 pl-5">
              {lines.map((l, i) => (
                <li key={i}>{inline(l.replace(/^\s*[-*] /, ""), `${b}-${i}`)}</li>
              ))}
            </ul>
          );
        }
        const heading = /^(#{1,3}) (.*)$/.exec(lines[0]);
        if (heading && lines.length === 1) {
          return (
            <h3 key={b} className="text-lg leading-6 font-bold">
              {inline(heading[2], `${b}`)}
            </h3>
          );
        }
        return (
          <p key={b}>
            {lines.map((l, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {inline(l, `${b}-${i}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
