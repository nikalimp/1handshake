import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { AutoSubmit } from "@/components/admin/member-actions";
import { MemberPanel, StatusChip } from "@/components/admin/member-panel";
import { ago, fmtDay } from "@/lib/admin-format";
import { adminBase, requireAdmin } from "@/lib/admin";
import { signedUrls } from "@/lib/files";

export const metadata = { title: "members" };

const PAGE = 50;

type Row = {
  id: string;
  handle: string | null;
  name: string | null;
  role: string | null;
  avatar_path: string | null;
  city: string | null;
  sphere: string | null;
  status: "active" | "ghost" | "banned";
  created_at: string;
  last_seen_at: string | null;
  invited_by: string | null;
  inviter_name: string | null;
  join_method: "founder" | "selfie" | "event";
  connections: number;
  invited: number;
  total: number;
};

type Params = { q?: string; city?: string; sphere?: string; status?: string; join?: string; from?: string; to?: string; page?: string; m?: string };

const JOIN_LABEL = { founder: "founder", selfie: "🤝 selfie", event: "🎟 at an event" } as const;

export default async function Members({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase } = await requireAdmin();
  const base = await adminBase();
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page) || 0);
  const int = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : null);
  const date = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const status = ["active", "ghost", "banned"].includes(sp.status ?? "") ? sp.status! : null;
  const join = ["founder", "selfie", "event"].includes(sp.join ?? "") ? sp.join! : null;
  const toDate = date(sp.to);

  const [{ data, error }, { data: cityIds }, { data: spheres }] = await Promise.all([
    supabase.rpc("admin_members", {
      p_q: sp.q?.trim() || null,
      p_city: int(sp.city),
      p_sphere: int(sp.sphere),
      p_status: status,
      p_join: join,
      p_from: date(sp.from) ? `${sp.from}T00:00:00Z` : null,
      p_to: toDate ? new Date(new Date(`${toDate}T00:00:00Z`).getTime() + 86_400_000).toISOString() : null,
      p_limit: PAGE,
      p_offset: page * PAGE,
    }),
    supabase.from("profiles").select("city_id").not("city_id", "is", null).returns<{ city_id: number }[]>(),
    supabase.from("spheres").select("id, name, parent_id").order("name").returns<{ id: number; name: string; parent_id: number | null }[]>(),
  ]);
  const rows = (data ?? []) as Row[];
  const total = Number(rows[0]?.total ?? 0);
  const ids = [...new Set((cityIds ?? []).map((r) => r.city_id))];
  const { data: cities } = ids.length
    ? await supabase.from("cities").select("id, name, country").in("id", ids).order("name").returns<{ id: number; name: string; country: string | null }[]>()
    : { data: [] };
  const avatars = await signedUrls(supabase, "avatars", rows.map((r) => r.avatar_path));
  const tops = (spheres ?? []).filter((s) => s.parent_id === null);

  // Links keep the filters; the panel opens with ?m=<id>.
  const query = (patch: Partial<Params>) => {
    const q = new URLSearchParams();
    const all = { ...sp, ...patch };
    for (const [k, v] of Object.entries(all)) if (v) q.set(k, String(v));
    const s = q.toString();
    return `${base}/members${s ? `?${s}` : ""}`;
  };
  const filtered = Boolean(sp.q || sp.city || sp.sphere || status || join || sp.from || sp.to);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3 pt-4 pb-4 md:pt-0">
        <h1 className="text-[32px] leading-9 font-extrabold tracking-[-0.03em]">members</h1>
        <p className="meta">{total} {filtered ? "found" : "in total"}</p>
      </header>

      <form id="members-filters" action={`${base}/members`} method="get" className="mb-4 flex flex-col gap-2 rounded-[var(--radius-lg)] bg-surface p-3 shadow-[var(--shadow-card)]">
        <AutoSubmit formId="members-filters" />
        <div className="flex gap-2">
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="search name or @handle"
            aria-label="search name or handle"
            className="h-10 min-w-0 flex-1 rounded-full bg-surface-sunk px-4 outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--ink)]"
          />
          <button className="h-10 rounded-full bg-fire px-4 text-sm font-semibold text-on-fire">search</button>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <Select name="city" label="city" value={sp.city} options={(cities ?? []).map((c) => ({ value: String(c.id), label: c.name.toLowerCase() }))} />
          <label className="flex flex-col gap-0.5">
            <span className="meta px-1">sphere</span>
            <select name="sphere" defaultValue={sp.sphere ?? ""} className={selectClass}>
              <option value="">all</option>
              {tops.map((t) => (
                <optgroup key={t.id} label={t.name.toLowerCase()}>
                  <option value={t.id}>all {t.name.toLowerCase()}</option>
                  {(spheres ?? [])
                    .filter((s) => s.parent_id === t.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name.toLowerCase()}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <Select name="status" label="status" value={sp.status} options={["active", "ghost", "banned"].map((v) => ({ value: v, label: v }))} />
          <Select name="join" label="joined how" value={sp.join} options={(["founder", "selfie", "event"] as const).map((v) => ({ value: v, label: JOIN_LABEL[v] }))} />
          <DateField name="from" label="joined from" value={sp.from} />
          <DateField name="to" label="joined to" value={sp.to} />
        </div>
        {filtered && (
          <Link href={`${base}/members`} className="meta self-start px-1 hover:text-ink">
            clear filters ×
          </Link>
        )}
      </form>

      {error && <p className="py-6 text-ink-muted">couldn&apos;t load members. try again in a minute.</p>}

      <div className="overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <caption className="sr-only">members</caption>
          <thead className="meta text-left">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 font-normal">member</th>
              <th className="hidden px-3 py-2.5 font-normal lg:table-cell">city · sphere</th>
              <th className="hidden px-3 py-2.5 font-normal md:table-cell">joined</th>
              <th className="px-3 py-2.5 text-right font-normal">conn.</th>
              <th className="hidden px-3 py-2.5 text-right font-normal sm:table-cell">invited</th>
              <th className="hidden px-4 py-2.5 text-right font-normal md:table-cell">last seen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const on = sp.m === r.id;
              return (
                <tr key={r.id} className={`border-b border-line last:border-0 ${on ? "bg-fire-soft" : "hover:bg-surface-sunk"}`}>
                  <td className="w-full max-w-0 px-4 py-2.5">
                    <Link href={query({ m: r.id })} scroll={false} className="flex min-w-0 items-center gap-3">
                      <Avatar name={r.name} size={36} src={avatars.get(r.avatar_path ?? "")} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-semibold">
                          <span className="truncate">{r.name ?? "deleted account"}</span>
                          {r.status !== "active" && <StatusChip status={r.status} />}
                        </span>
                        <span className="meta block truncate">
                          {r.handle ? `@${r.handle}` : "—"}
                          {r.role ? ` · ${r.role.toLowerCase()}` : ""}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="hidden px-3 py-2.5 lg:table-cell">
                    <span className="block lowercase">{r.city ?? "—"}</span>
                    <span className="meta block lowercase">{r.sphere ?? "—"}</span>
                  </td>
                  <td className="hidden px-3 py-2.5 whitespace-nowrap md:table-cell">
                    <span className="block">{fmtDay(r.created_at)}</span>
                    <span className="meta block">
                      {JOIN_LABEL[r.join_method]}
                      {r.inviter_name ? ` · ${r.inviter_name.toLowerCase()}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{r.connections}</td>
                  <td className="hidden px-3 py-2.5 text-right font-mono tabular-nums sm:table-cell">{r.invited}</td>
                  <td className="hidden px-4 py-2.5 text-right md:table-cell">
                    <span className="meta">{ago(r.last_seen_at)}</span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !error && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-muted">
                  nobody matches these filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total > PAGE && (
        <nav aria-label="pages" className="mt-4 flex items-center justify-between">
          {page > 0 ? (
            <Link href={query({ page: String(page - 1), m: undefined })} className="meta hover:text-ink">
              ← newer
            </Link>
          ) : (
            <span />
          )}
          <span className="meta">
            {page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total}
          </span>
          {(page + 1) * PAGE < total ? (
            <Link href={query({ page: String(page + 1), m: undefined })} className="meta hover:text-ink">
              older →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      {sp.m && /^[0-9a-f-]{36}$/.test(sp.m) && <MemberPanel id={sp.m} base={base} closeHref={query({ m: undefined })} />}
    </>
  );
}

const selectClass = "h-10 w-full rounded-full bg-surface-sunk px-3 text-sm outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--ink)]";

function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: { value: string; label: string }[] }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="meta px-1">{label}</span>
      <select name={name} defaultValue={value ?? ""} className={selectClass}>
        <option value="">all</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateField({ name, label, value }: { name: string; label: string; value?: string }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="meta px-1">{label}</span>
      <input type="date" name={name} defaultValue={value ?? ""} className={selectClass} />
    </label>
  );
}
