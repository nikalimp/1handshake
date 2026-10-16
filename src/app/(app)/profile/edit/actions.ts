"use server";
import { revalidatePath } from "next/cache";
import { reviseCard } from "@/lib/ai-card";
import { getMe } from "@/lib/data";
import { MAX_NEEDS } from "@/lib/needs";
import { LINK_KINDS, type LinkKey, type Links, normalizeLink } from "@/lib/links";
import { createClient } from "@/lib/supabase/server";


export type ProfileInput = {
  name: string;
  role: string;
  handle: string;
  bio_md: string;
  city_id: number | null;
  birth_date: string | null;
  avatar_path: string | null;
  open_to_hiring: boolean;
  open_to_network: boolean;
  spheres: number[]; // up to 3, the first one is primary
  links: Partial<Record<LinkKey, string>>; // as typed: a handle or a link
  needs: string[]; // i need
  cans: string[]; // i can
};

/** Saves my card. Only the columns a member may change are granted in the database. */
export async function saveProfile(input: ProfileInput): Promise<{ ok: true } | { error: string }> {
  const me = await getMe();
  if (!me) return { error: "members only" };

  const handle = input.handle.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9_]{2,30}$/.test(handle)) return { error: "handle: 2–30 latin letters, digits or _" };
  if (!input.name.trim()) return { error: "add your name" };
  if (!input.role.trim()) return { error: "add what you do" };
  if (!input.city_id) return { error: "pick your city" };
  if (input.avatar_path && !input.avatar_path.startsWith(`${me.id}/`)) return { error: "that photo isn't yours" };

  const links: Links = {};
  for (const k of LINK_KINDS) {
    const res = normalizeLink(k.key, input.links[k.key] ?? "");
    if ("error" in res) return { error: res.error };
    if (res.url) links[k.key] = res.url;
  }
  const tidy = (list: string[]) => [...new Set(list.map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean))].slice(0, MAX_NEEDS).map((x) => x.slice(0, 200));
  const needs = tidy(input.needs);
  const cans = tidy(input.cans);

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      name: input.name.trim().slice(0, 80),
      role: input.role.trim().slice(0, 80),
      handle,
      bio_md: input.bio_md.slice(0, 4000),
      city_id: input.city_id,
      birth_date: input.birth_date || null,
      avatar_path: input.avatar_path,
      links,
      open_to_hiring: input.open_to_hiring,
      // "open to network" needs "open to hiring": the database enforces it too.
      open_to_network: input.open_to_hiring && input.open_to_network,
    })
    .eq("id", me.id);
  if (error) {
    if (error.code === "23505") return { error: `@${handle} is taken — try another handle` };
    return { error: "couldn't save. try again." };
  }

  // Spheres: replace the set; the first one is primary.
  const picked = [...new Set(input.spheres)].slice(0, 3);
  await supabase.from("profile_spheres").delete().eq("profile_id", me.id);
  if (picked.length) {
    await supabase.from("profile_spheres").insert(picked.map((sphere_id, i) => ({ profile_id: me.id, sphere_id, is_primary: i === 0 })));
  }

  // I need / I can: replace the set, in the order typed.
  await supabase.from("needs_offers").delete().eq("profile_id", me.id);
  const rows = [...needs.map((body) => ({ kind: "need", body })), ...cans.map((body) => ({ kind: "can", body }))];
  if (rows.length) {
    const t = Date.now();
    await supabase.from("needs_offers").insert(rows.map((r, i) => ({ ...r, profile_id: me.id, created_at: new Date(t + i).toISOString() })));
  }

  // Keep only the current photo in my avatars folder.
  const { data: files } = await supabase.storage.from("avatars").list(me.id, { limit: 100 });
  const stale = (files ?? []).map((f) => `${me.id}/${f.name}`).filter((p) => p !== input.avatar_path);
  if (stale.length) await supabase.storage.from("avatars").remove(stale);

  revalidatePath("/profile");
  revalidatePath("/connect");
  revalidatePath("/graph");
  return { ok: true };
}

/** Voice edit of my card: what I said → the updated card text (not saved until I press save). */
export async function reviseBio(bio: string, spoken: string): Promise<{ bio: string } | { error: string }> {
  const me = await getMe();
  if (!me) return { error: "members only" };
  if (!spoken.trim()) return { error: "didn't catch that" };
  const next = await reviseCard(bio, spoken);
  return next ? { bio: next } : { error: "couldn't rewrite the card right now — your words were added at the end instead" };
}
