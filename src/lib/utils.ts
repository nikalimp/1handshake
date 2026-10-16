export function initials(name: string | null) {
  if (!name) return "👻";
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2);
}
