"use server";
import { draftCard, type DraftCard } from "@/lib/ai-card";
import { createClient } from "@/lib/supabase/server";

async function signedInUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

/** Voice/text intro → draft card (Claude when ANTHROPIC_API_KEY is set, otherwise the transcript as is). */
export async function makeCard(code: string, transcript: string): Promise<(DraftCard & { ai: boolean; sphereIds: number[] }) | { error: string }> {
  const { supabase, user } = await signedInUser();
  if (!user) return { error: "sign in with google first" };
  await supabase.rpc("set_guest_step", { p_code: code, p_step: "card" });
  const meta = user.user_metadata as { full_name?: string; name?: string };
  const { data: spheres } = await supabase.from("spheres").select("id, name, parent_id").not("parent_id", "is", null).returns<{ id: number; name: string }[]>();
  const card = await draftCard(transcript, meta.full_name ?? meta.name ?? "", user.email ?? "", (spheres ?? []).map((s) => s.name));
  // Sphere names from the AI → ids (unknown names are dropped).
  const byName = new Map((spheres ?? []).map((s) => [s.name.toLowerCase(), s.id]));
  const sphereIds = [...new Set(card.spheres.map((n) => byName.get(n.toLowerCase())).filter((x): x is number => typeof x === "number"))].slice(0, 3);
  return { ...card, sphereIds };
}

export type JoinInput = {
  code: string;
  handle: string;
  name: string;
  role: string;
  bio_md: string;
  city_id: number;
  birth_date: string | null;
  avatar_path: string | null;
  agreed: boolean;
  spheres: number[];
};

/** Creates the profile, the 🤝 connection with the inviter and uses up the code — all or nothing. */
export async function joinClub(input: JoinInput): Promise<{ ok: true } | { error: string }> {
  const { supabase, user } = await signedInUser();
  if (!user) return { error: "sign in with google first" };

  if (input.agreed !== true) return { error: "tick the agreement to join" };
  const handle = input.handle.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9_]{2,30}$/.test(handle)) return { error: "handle: 2–30 latin letters, digits or _" };
  if (!input.name.trim()) return { error: "add your name" };
  if (!input.role.trim()) return { error: "add what you do" };
  if (!input.city_id) return { error: "pick your city" };

  const { error } = await supabase.rpc("accept_invite", {
    p_code: input.code,
    p_handle: handle,
    p_name: input.name.trim().slice(0, 80),
    p_role: input.role.trim().slice(0, 80),
    p_bio_md: input.bio_md.slice(0, 4000),
    p_city_id: input.city_id,
    p_birth_date: input.birth_date || null,
  });
  if (error) {
    if (error.code === "23505") return { error: `@${handle} is taken — try another handle` };
    if (error.message.includes("no longer valid")) return { error: "the invite expired. ask for a new handshake." };
    if (error.message.includes("already a member")) return { ok: true };
    return { error: "couldn't join right now. try again in a moment." };
  }
  if (input.avatar_path?.startsWith(`${user.id}/`)) {
    await supabase.from("profiles").update({ avatar_path: input.avatar_path }).eq("id", user.id);
  }
  // Spheres, if any (the member can change them later in their profile).
  const picked = [...new Set(input.spheres)].slice(0, 3);
  if (picked.length) await supabase.from("profile_spheres").insert(picked.map((sphere_id, i) => ({ profile_id: user.id, sphere_id, is_primary: i === 0 })));
  // Photos tried and replaced during registration aren't needed anymore.
  const { data: files } = await supabase.storage.from("avatars").list(user.id, { limit: 100 });
  const stale = (files ?? []).map((f) => `${user.id}/${f.name}`).filter((p) => p !== input.avatar_path);
  if (stale.length) await supabase.storage.from("avatars").remove(stale);
  return { ok: true };
}

export async function markStep(code: string, step: "about" | "card") {
  const supabase = await createClient();
  await supabase.rpc("set_guest_step", { p_code: code, p_step: step });
}
