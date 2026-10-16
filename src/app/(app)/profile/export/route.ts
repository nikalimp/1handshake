import { NextResponse } from "next/server";
import { getMe } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

// Everything the club keeps about me, as a JSON file.
export async function GET() {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "members only" }, { status: 401 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_export");
  if (error) return NextResponse.json({ error: "couldn't export. try again." }, { status: 500 });
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="1handshake-${me.handle ?? "me"}-${day}.json"`,
      "cache-control": "no-store",
    },
  });
}
