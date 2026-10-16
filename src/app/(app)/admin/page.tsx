import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { ScreenTitle } from "@/components/screen-title";
import { CARD_FIELDS, type Card, requireMe } from "@/lib/data";
import { signedUrls } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";
import { Decision } from "./decision";

export const metadata = { title: "moderation", robots: { index: false } };

type Flag = { invite_id: string; inviter_id: string; guest_id: string; selfie_path: string | null; met_at: string; reports: number; reasons: string[]; flagged_at: string | null };

const day = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });

// Admin queue: reported handshakes. 3 reports hide the selfie; an admin keeps it or cancels the connection.
export default async function AdminPage() {
  await requireMe();
  const supabase = await createClient();
  const { data: admin } = await supabase.rpc("is_admin");
  if (admin !== true) notFound();

  const { data } = await supabase.rpc("admin_flags");
  const flags = ((data ?? []) as Flag[]).map((f) => ({ ...f, reports: Number(f.reports) }));
  const ids = [...new Set(flags.flatMap((f) => [f.inviter_id, f.guest_id]))];
  const { data: rows } = ids.length ? await supabase.from("profiles").select(CARD_FIELDS).in("id", ids).returns<Card[]>() : { data: [] as Card[] };
  const people = new Map((rows ?? []).map((p) => [p.id, p]));
  // Admins see the selfie even when it's hidden from members: signed by the server's own session.
  const [selfies, avatars] = await Promise.all([
    signedUrls(supabase, "selfies", flags.map((f) => f.selfie_path)),
    signedUrls(supabase, "avatars", (rows ?? []).map((p) => p.avatar_path)),
  ]);

  return (
    <>
      <ScreenTitle title="moderation" />
      <p className="meta mb-4 px-0.5">reported handshakes · 3 reports from different members hide the selfie until you decide</p>
      <div className="flex flex-col gap-4">
        {flags.map((f) => {
          const a = people.get(f.inviter_id);
          const b = people.get(f.guest_id);
          const selfie = f.selfie_path ? selfies.get(f.selfie_path) : null;
          const names = `${a?.name ?? "a member"} and ${b?.name ?? "a member"}`;
          return (
            <article key={f.invite_id} className="overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]">
              {selfie ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selfie} alt={`selfie of ${names}`} className="aspect-square w-full object-cover" />
              ) : (
                <div className="grid aspect-[2/1] w-full place-items-center bg-surface-sunk text-ink-muted">no selfie</div>
              )}
              <div className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex">
                    <Avatar name={a?.name ?? null} size={36} src={avatars.get(a?.avatar_path ?? "")} />
                    <span className="-ml-2">
                      <Avatar name={b?.name ?? null} size={36} src={avatars.get(b?.avatar_path ?? "")} />
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {[a, b].map((p, i) => (
                        <span key={i}>
                          {i > 0 && " & "}
                          {p?.handle ? (
                            <Link href={`/people/${p.handle}`} className="hover:underline">
                              {p.name}
                            </Link>
                          ) : (
                            (p?.name ?? "a member")
                          )}
                        </span>
                      ))}
                    </p>
                    <p className="meta">
                      met {day.format(new Date(f.met_at)).toLowerCase()} · {f.reports} {f.reports === 1 ? "report" : "reports"}
                      {f.flagged_at ? " · hidden" : ""}
                    </p>
                  </div>
                </div>
                <Decision inviteId={f.invite_id} names={names} />
              </div>
            </article>
          );
        })}
        {flags.length === 0 && <p className="px-0.5 text-ink-muted">nothing to check. all handshakes look real. 🤝</p>}
      </div>
    </>
  );
}
