import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google sends the member back here. We exchange the code for a session, then:
// - invite flow (`next` starts with /i/) → continue registration;
// - existing member → their `next` page;
// - signed in but not a member → back to the landing page with a note.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/connect";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/connect";

  if (!code) return NextResponse.redirect(`${origin}/?error=sign-in-failed`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(`${origin}/?error=sign-in-failed`);

  if (next.startsWith("/i/")) return NextResponse.redirect(`${origin}${next}`);

  const { data: profile } = await supabase.from("profiles").select("status").eq("id", data.user.id).maybeSingle();
  if (!profile || profile.status !== "active") {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/?error=members-only`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
