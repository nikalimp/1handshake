"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getMe } from "@/lib/data";
import { firstName, sendPush } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Accept or decline an intro request addressed to me. Accepting creates a 🔗 connection. */
export async function respondRequest(requestId: string, accept: boolean): Promise<{ ok: true } | { error: string }> {
  const me = await getMe();
  if (!me) return { error: "members only" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_request", { p_request: requestId, p_accept: accept });
  if (error) return { error: error.message.includes("already answered") ? "already answered" : "couldn't answer. try again." };
  if (accept) {
    after(async () => {
    const admin = createAdminClient();
    if (!admin) return;
      const { data: req } = await admin.from("intro_requests").select("from_id").eq("id", requestId).maybeSingle<{ from_id: string }>();
      if (req) await sendPush([req.from_id], { title: `${firstName(me.name)} accepted your intro 🔗`, body: "you're connected now — say hi", url: me.handle ? `/people/${me.handle}` : "/feed", tag: `ok-${requestId}` });
    });
  }
  revalidatePath("/feed");
  revalidatePath("/connect");
  return { ok: true };
}

/** As a mutual, back (or un-back) someone's intro request with a 🔥. */
export async function backRequest(requestId: string, backed: boolean) {
  const me = await getMe();
  if (!me) return;
  const supabase = await createClient();
  await supabase.rpc("back_request", { p_request: requestId, p_backed: backed });
}
