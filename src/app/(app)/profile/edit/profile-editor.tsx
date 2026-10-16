"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { Button, buttonClass } from "@/components/button";
import { MarkdownField } from "@/components/markdown-field";
import { SITE_HOST } from "@/lib/env";
import { fileToSquareJpeg } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";
import { saveProfile } from "./actions";

type Me = {
  id: string;
  name: string;
  role: string;
  handle: string;
  bio_md: string;
  city_id: number | null;
  birth_date: string;
  avatar_path: string | null;
  avatar_url: string | null;
  open_to_hiring: boolean;
  open_to_network: boolean;
  spheres: number[];
};
type Sphere = { id: number; parent_id: number | null; name: string };

const field = "w-full rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3 outline-none focus:border-line-strong";

function Toggle({ on, onChange, disabled, label, hint }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; hint: string }) {
  return (
    <label className={`flex items-start justify-between gap-4 py-3 ${disabled ? "opacity-50" : ""}`}>
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-ink-muted">{hint}</span>
      </span>
      <input type="checkbox" role="switch" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--focus)] ${on ? "bg-fire" : "bg-surface-sunk shadow-[inset_0_0_0_1.5px_var(--line-strong)]"}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-surface shadow transition-[left] ${on ? "left-6" : "left-1"}`} />
      </span>
    </label>
  );
}

export function ProfileEditor({ me, cities, spheres }: { me: Me; cities: { id: number; name: string }[]; spheres: Sphere[] }) {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const file = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(me);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  const set = <K extends keyof Me>(k: K, v: Me[K]) => setForm((f) => ({ ...f, [k]: v }));

  const pickPhoto = async (f: File) => {
    setUploading(true);
    setError(null);
    try {
      const blob = await fileToSquareJpeg(f, 640);
      const path = `${me.id}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      setForm((x) => ({ ...x, avatar_path: path, avatar_url: URL.createObjectURL(blob) }));
    } catch {
      setError("couldn't upload the photo. try another one.");
    } finally {
      setUploading(false);
    }
  };

  const save = () =>
    start(async () => {
      setError(null);
      const res = await saveProfile({
        name: form.name,
        role: form.role,
        handle: form.handle,
        bio_md: form.bio_md,
        city_id: form.city_id,
        birth_date: form.birth_date || null,
        avatar_path: form.avatar_path,
        open_to_hiring: form.open_to_hiring,
        open_to_network: form.open_to_network,
        spheres: form.spheres,
      });
      if ("error" in res) setError(res.error);
      else {
        router.push("/profile");
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-5 pt-6">
      <header className="flex items-center justify-between px-0.5">
        <h1 className="text-[32px] leading-9 font-extrabold tracking-[-0.03em]">edit profile</h1>
        <Link href="/profile" className={buttonClass("ghost", "sm")}>
          cancel
        </Link>
      </header>

      <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-4">
          <Avatar name={form.name || null} size={84} src={form.avatar_url} />
          <div className="flex flex-col items-start gap-1.5">
            <Button variant="secondary" size="sm" disabled={uploading} onClick={() => file.current?.click()}>
              {uploading ? "uploading…" : form.avatar_path ? "change photo" : "add photo"}
            </Button>
            {form.avatar_path && (
              <button type="button" className="meta hover:text-ink" onClick={() => setForm((x) => ({ ...x, avatar_path: null, avatar_url: null }))}>
                remove photo
              </button>
            )}
          </div>
          <input
            ref={file}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void pickPhoto(f);
            }}
          />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="meta">name</span>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={80} className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="meta">what you do</span>
          <input value={form.role} onChange={(e) => set("role", e.target.value)} maxLength={80} placeholder="e.g. founder, ai notes app" className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="meta">handle · {SITE_HOST}/@{form.handle || "you"}</span>
          <div className="flex items-center rounded-[var(--radius-md)] border border-line bg-surface pl-4 focus-within:border-line-strong">
            <span className="text-ink-muted">@</span>
            <input value={form.handle} onChange={(e) => set("handle", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} maxLength={30} className="w-full bg-transparent px-1 py-3 outline-none" />
          </div>
          {form.handle !== me.handle && <span className="text-xs text-fire-ink">links to {SITE_HOST}/@{me.handle} will stop working. your connections stay.</span>}
        </label>
        <MarkdownField value={form.bio_md} onChange={(v) => set("bio_md", v)} />
      </section>

      <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-card)]">
        <label className="flex flex-col gap-1.5">
          <span className="meta">city</span>
          <select value={form.city_id ?? ""} onChange={(e) => set("city_id", e.target.value ? Number(e.target.value) : null)} className={field}>
            <option value="">pick your city</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="meta">birthday · only you see it</span>
          <input type="date" value={form.birth_date} onChange={(e) => set("birth_date", e.target.value)} max={today} className={field} />
        </label>
      </section>

      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-card)]" aria-label="spheres">
        <div>
          <p className="font-semibold">what you work in</p>
          <p className="text-sm text-ink-muted">up to 3 · the first one is your main sphere · members filter the graph by it</p>
        </div>
        {spheres
          .filter((p) => p.parent_id === null)
          .map((p) => (
            <div key={p.id} className="flex flex-col gap-1.5">
              <span className="meta">{p.name}</span>
              <div className="flex flex-wrap gap-1.5">
                {spheres
                  .filter((s) => s.parent_id === p.id)
                  .map((s) => {
                    const at = form.spheres.indexOf(s.id);
                    const on = at !== -1;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={on}
                        disabled={!on && form.spheres.length >= 3}
                        onClick={() => set("spheres", on ? form.spheres.filter((x) => x !== s.id) : [...form.spheres, s.id])}
                        className={`rounded-full px-3 py-1.5 text-sm transition-colors disabled:opacity-40 ${on ? "bg-fire font-semibold text-on-fire" : "bg-surface-sunk"}`}
                      >
                        {at === 0 && "★ "}
                        {s.name}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
      </section>

      <section className="flex flex-col divide-y divide-line rounded-[var(--radius-lg)] bg-surface px-5 py-2 shadow-[var(--shadow-card)]">
        <Toggle
          label="open to hiring"
          hint="your card shows up in connect, and members can ask for an intro"
          on={form.open_to_hiring}
          onChange={(v) => setForm((x) => ({ ...x, open_to_hiring: v, open_to_network: v ? x.open_to_network : false }))}
        />
        <Toggle
          label="open to network"
          hint="members can see your connections and reach people through you"
          on={form.open_to_network}
          disabled={!form.open_to_hiring}
          onChange={(v) => set("open_to_network", v)}
        />
      </section>

      {error && (
        <p role="alert" className="rounded-[var(--radius-md)] bg-fire-soft px-4 py-3 text-sm text-fire-ink">
          {error}
        </p>
      )}
      <Button disabled={pending || uploading} onClick={save}>
        {pending ? "saving…" : "save"}
      </Button>
    </div>
  );
}
