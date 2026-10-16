import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { ScreenTitle } from "@/components/screen-title";
import { ReviewButtons } from "@/components/event-controls";
import { CARD_FIELDS, type Card, requireMe } from "@/lib/data";
import { coverUrl, EVENT_FIELDS, type EventRow, formatWhen } from "@/lib/event-format";
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

  const [{ data }, { data: pendingEvents }] = await Promise.all([
    supabase.rpc("admin_flags"),
    supabase.from("events").select(EVENT_FIELDS).eq("review", "pending").is("cancelled_at", null).order("created_at").returns<EventRow[]>(),
  ]);
  const flags = ((data ?? []) as Flag[]).map((f) => ({ ...f, reports: Number(f.reports) }));
  const ids = [...new Set([...flags.flatMap((f) => [f.inviter_id, f.guest_id]), ...(pendingEvents ?? []).map((e) => e.host_id)])];
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
      {(pendingEvents ?? []).length > 0 && (
        <section className="mb-8 flex flex-col gap-3" aria-label="events to review">
          <h2 className="px-0.5 text-[22px] leading-7 font-extrabold tracking-[-0.02em]">events to review</h2>
          <p className="meta px-0.5">approved events go on the public calendar, and their check-in qr starts working</p>
          {(pendingEvents ?? []).map((e) => {
            const host = people.get(e.host_id);
            const cover = coverUrl(e.cover_path);
            return (
              <article key={e.id} className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
                <Link href={`/events/${e.slug}`} className="flex gap-3">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" className="h-16 w-16 shrink-0 rounded-[var(--radius-md)] object-cover" />
                  ) : (
                    <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[var(--radius-md)] bg-surface-sunk text-2xl">🎟</span>
                  )}
                  <span className="min-w-0">
                    <span className="block font-extrabold">{e.title}</span>
                    <span className="meta block">{formatWhen(e)}</span>
                    <span className="block text-sm text-ink-muted">by {host?.name ?? "a member"}</span>
                  </span>
                </Link>
                <ReviewButtons eventId={e.id} />
              </article>
            );
          })}
        </section>
      )}
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
