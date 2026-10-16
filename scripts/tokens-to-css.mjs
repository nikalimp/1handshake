// Generates src/app/tokens.css from design/tokens.json (the 1handshake Design System).
// Usage: npm run tokens
import { readFileSync, writeFileSync } from "node:fs";

const t = JSON.parse(readFileSync("design/tokens.json", "utf8"));
const [light, dark] = t.color.themes.map((x) => x.id);
const colors = (theme) => t.color.tokens.map((c) => `  --${c.name}: ${typeof c.value === "string" ? c.value : c.value[theme]};`).join("\n");
const shadows = (theme) => (t.shadow?.tokens ?? []).map((s) => `  --${s.name}: ${typeof s.value === "string" ? s.value : s.value[theme]};`).join("\n");
const flat = (fam) => (t[fam]?.tokens ?? []).map((s) => `  --${s.name}: ${s.value};`).join("\n");

const css = `/* 1handshake — generated from design/tokens.json by scripts/tokens-to-css.mjs. Do not edit by hand. */
:root {
${colors(light)}
${shadows(light)}
${flat("spacing")}
${flat("radius")}
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${colors(dark).replace(/^/gm, "  ")}
${shadows(dark).replace(/^/gm, "  ")}
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
${colors(dark)}
${shadows(dark)}
  color-scheme: dark;
}
`;
writeFileSync("src/app/tokens.css", css);
console.log("tokens.css written:", t.color.tokens.length, "colors");
