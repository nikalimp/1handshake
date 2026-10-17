// Dates in the admin panel: "17 oct 2026", "3d ago".
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const fmtDay = (iso: string | null | undefined) => (iso ? day.format(new Date(iso)).toLowerCase() : "—");

export function ago(iso: string | null | undefined) {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 30 ? `${d}d ago` : fmtDay(iso);
}
