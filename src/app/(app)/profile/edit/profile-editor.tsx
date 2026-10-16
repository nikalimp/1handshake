"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { Button, buttonClass } from "@/components/button";
import { type City, CityPicker } from "@/components/city-picker";
import { Combobox, type Option } from "@/components/combobox";
import { ListField } from "@/components/list-field";
import { MarkdownField } from "@/components/markdown-field";
import { SITE_HOST } from "@/lib/env";
import { fileToSquareJpeg } from "@/lib/image";
import { LINK_KINDS, type LinkKey } from "@/lib/links";
import { MAX_NEEDS } from "@/lib/needs";
import { createClient } from "@/lib/supabase/client";
import { saveProfile } from "./actions";

type Me = {
  id: string;
  name: string;
  role: string;
  handle: string;
  bio_md: string;
  city: City | null;
  birth_date: string;
  avatar_path: string | null;
  avatar_url: string | null;
  open_to_hiring: boolean;
  open_to_network: boolean;
  spheres: number[];
  links: Partial<Record<LinkKey, string>>;
  needs: string[];
  cans: string[];
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

export function ProfileEditor({ me, spheres }: { me: Me; spheres: Sphere[] }) {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const file = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(me);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  const sphereName = useMemo(() => new Map(spheres.map((s) => [s.id, s.name])), [spheres]);
  const searchSpheres = useCallback(
    (q: string): Option[] => {
      const term = q.trim().toLowerCase();
      const parents = spheres.filter((p) => p.parent_id === null);
      return parents.flatMap((p) =>
        spheres
          .filter((s) => s.parent_id === p.id && (!term || s.name.toLowerCase().includes(term) || p.name.toLowerCase().includes(term)))
          .sort((a, b) => Number(!a.name.toLowerCase().startsWith(term)) - Number(!b.name.toLowerCase().startsWith(term)))
          .map((s) => ({ id: s.id, label: s.name, group: p.name, disabled: form.spheres.includes(s.id), hint: form.spheres.includes(s.id) ? "added" : undefined })),
      );
    },
    [spheres, form.spheres],
  );

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
        city_id: form.city?.id ?? null,
        birth_date: form.birth_date || null,
        avatar_path: form.avatar_path,
        open_to_hiring: form.open_to_hiring,
        open_to_network: form.open_to_network,
        spheres: form.spheres,
        links: form.links,
        needs: form.needs,
        cans: form.cans,
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

      <section className="flex flex-col gap-5 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-card)]" aria-label="i need and i can">
        <p className="text-sm text-ink-muted">members see these and connect finds you matches. on your public card they stay blurred.</p>
        <ListField label="i need" items={form.needs} onChange={(v) => set("needs", v)} max={MAX_NEEDS} placeholder="e.g. a cto for a fintech startup" />
        <ListField label="i can" items={form.cans} onChange={(v) => set("cans", v)} max={MAX_NEEDS} placeholder="e.g. review your pitch deck" />
      </section>

      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-card)]" aria-label="links">
        <div>
          <p className="font-semibold">links</p>
          <p className="text-sm text-ink-muted">there&apos;s no chat in the club yet — this is how members reach you</p>
        </div>
        {LINK_KINDS.map((k) => (
          <label key={k.key} className="flex items-center gap-3">
            <span className="meta w-20 shrink-0">{k.label}</span>
            <input
              value={form.links[k.key] ?? ""}
              onChange={(e) => set("links", { ...form.links, [k.key]: e.target.value })}
              placeholder={k.placeholder}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="url"
              className={`${field} py-2.5`}
            />
          </label>
        ))}
      </section>

      <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-1.5">
          <span className="meta">city</span>
          <CityPicker value={form.city} onChange={(c) => set("city", c)} className={field} />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="meta">birthday · only you see it</span>
          <input type="date" value={form.birth_date} onChange={(e) => set("birth_date", e.target.value)} max={today} className={field} />
        </label>
      </section>

      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-card)]" aria-label="spheres">
        <div>
          <p className="font-semibold">what you work in</p>
          <p className="text-sm text-ink-muted">up to 3 · ★ is your main one, tap another to make it main · members filter the graph by it</p>
        </div>
        {form.spheres.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {form.spheres.map((id, i) => (
              <li key={id} className={`flex items-center rounded-full text-sm ${i === 0 ? "bg-fire font-semibold text-on-fire" : "bg-surface-sunk"}`}>
                <button type="button" disabled={i === 0} onClick={() => set("spheres", [id, ...form.spheres.filter((x) => x !== id)])} className="py-1.5 pl-3" title={i === 0 ? "your main sphere" : "make it main"}>
                  {i === 0 && "★ "}
                  {sphereName.get(id)}
                </button>
                <button type="button" aria-label={`remove ${sphereName.get(id)}`} onClick={() => set("spheres", form.spheres.filter((x) => x !== id))} className="py-1.5 pr-3 pl-2 opacity-70 hover:opacity-100">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {form.spheres.length < 3 ? (
          <Combobox label="add a sphere" placeholder={form.spheres.length ? "add another, e.g. product, ios, seo" : "type, e.g. product, ios, seo"} value={null} clearOnSelect onChange={(o) => o && set("spheres", [...form.spheres, o.id])} search={searchSpheres} className={field} />
        ) : (
          <p className="meta">that&apos;s 3 · remove one to pick another</p>
        )}
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
