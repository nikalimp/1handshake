"use server";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Delete my account: personal data goes, the node stays in the graph as a ghost 👻
// so other people's chains of intros don't break. Photos and the sign-in are removed too.
export async function deleteAccount(confirmHandle: string): Promise<{ error: string } | never> {
  const me = await getMe();
  if (!me) return { error: "members only" };
  if (confirmHandle.trim().toLowerCase().replace(/^@/, "") !== me.handle) return { error: "type your handle to confirm" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("become_ghost");
  if (error) return { error: "couldn't delete. try again." };

  const admin = createAdminClient();
  if (admin) {
    for (const bucket of ["avatars", "selfies"]) {
      const { data: files } = await admin.storage.from(bucket).list(me.id, { limit: 1000 });
      const paths = (files ?? []).map((f) => `${me.id}/${f.name}`);
      if (paths.length) await admin.storage.from(bucket).remove(paths);
    }
  }
  await supabase.auth.signOut();
  if (admin) await admin.auth.admin.deleteUser(me.id);
  redirect("/?bye=1");
}
