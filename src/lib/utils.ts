export function initials(name: string | null) {
  if (!name) return "👻";
  // Whole characters, so an emoji isn't cut in half.
  return Array.from(name.split(/\s+/).filter(Boolean).map((w) => Array.from(w)[0]).join("")).slice(0, 2).join("");
}
