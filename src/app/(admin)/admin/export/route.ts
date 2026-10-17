import { NextResponse, type NextRequest } from "next/server";
import { adminState, periodRange } from "@/lib/admin";
import { METRICS, type TimeRow, seriesOf, weekRange } from "@/lib/admin-stats";

// CSV of the weekly series behind the overview: one row per week, one column per metric.
export async function GET(request: NextRequest) {
  const state = await adminState();
  if (state.kind !== "admin") return new NextResponse("not found", { status: 404 });
  const { period, from, to } = periodRange(request.nextUrl.searchParams.get("period") ?? undefined);
  const { data, error } = await state.supabase.rpc("admin_timeseries", { p_from: from, p_to: to });
  if (error) return new NextResponse("couldn't load the numbers", { status: 500 });

  const rows = (data ?? []) as TimeRow[];
  const weeks = weekRange(rows, from);
  const cols = METRICS.map((m) => seriesOf(rows, weeks, m.key));
  const header = ["week", ...METRICS.map((m) => m.key)].join(",");
  const lines = weeks.map((w, i) => [w, ...cols.map((c) => c[i])].join(","));
  const csv = [header, ...lines].join("\n") + "\n";
  const name = `1handshake-weekly-${period.key}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
