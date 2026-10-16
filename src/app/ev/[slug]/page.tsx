import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/button";
import { EventCover, EventFacts } from "@/components/event-view";
import { Logo } from "@/components/logo";
import { Markdown, plainText } from "@/components/markdown";
import { getMe } from "@/lib/data";
import { APP_URL, CARD_HOST, CARD_URL } from "@/lib/env";
import { coverUrl, formatWhen, isOver } from "@/lib/event-format";
import { publicEvent } from "@/lib/events-public";

// The public event page: 1handshake.com/e/<slug> (the site proxies it here, to /ev/<slug>).
// Every link is absolute for that reason.

export async function generateMetadata(props: PageProps<"/ev/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const ev = await publicEvent(slug);
  if (!ev) return { title: "event", robots: { index: false } };
  const description = `${formatWhen(ev)} · ${ev.online ? "online" : [ev.venue, ev.city].filter(Boolean).join(", ")} — ${plainText(ev.body_md)}`.slice(0, 160);
  const image = coverUrl(ev.cover_path);
  return {
    title: ev.title,
    description,
    alternates: { canonical: `${CARD_URL}/e/${ev.slug}` },
    openGraph: { title: ev.title, description, type: "website", url: `${CARD_URL}/e/${ev.slug}`, images: image ? [{ url: image, width: 1200, height: 1200 }] : undefined },
    icons: { icon: `${APP_URL}/1h-app-icon.svg`, apple: `${APP_URL}/apple-icon.png` },
  };
}

export default async function PublicEventPage(props: PageProps<"/ev/[slug]">) {
  const { slug } = await props.params;
  const ev = await publicEvent(slug);
  if (!ev) notFound();
  const viewer = await getMe();
  const over = isOver(ev);
  const image = coverUrl(ev.cover_path);

  // schema.org Event: search engines show it in event listings.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: ev.title,
    description: plainText(ev.body_md).slice(0, 500),
    startDate: ev.starts_at,
    ...(ev.ends_at ? { endDate: ev.ends_at } : {}),
    eventStatus: ev.cancelled ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: ev.online ? "https://schema.org/OnlineEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
    location: ev.online
      ? { "@type": "VirtualLocation", url: ev.registration_url ?? `${CARD_URL}/e/${ev.slug}` }
      : { "@type": "Place", name: ev.venue ?? ev.city ?? "tba", address: { "@type": "PostalAddress", streetAddress: ev.address ?? undefined, addressLocality: ev.city ?? undefined, addressCountry: ev.country ?? undefined } },
    ...(image ? { image: [image] } : {}),
    ...(ev.host_handle ? { organizer: { "@type": "Person", name: ev.host_name, url: `${CARD_URL}/@${ev.host_handle}` } } : {}),
    ...(ev.price
      ? { offers: { "@type": "Offer", url: ev.registration_url ?? `${CARD_URL}/e/${ev.slug}`, ...(/^free$/i.test(ev.price) ? { price: 0 } : { description: ev.price }), availability: "https://schema.org/InStock" } }
      : {}),
    url: `${CARD_URL}/e/${ev.slug}`,
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <a href={`${CARD_URL}/`} aria-label="what is 1handshake" className="text-ink">
        <Logo size={28} />
      </a>
      <div className="overflow-hidden rounded-[var(--radius-lg)]">
        <EventCover path={ev.cover_path} title={ev.title} />
      </div>
      {ev.cancelled && <p className="rounded-[var(--radius-md)] bg-fire-soft px-4 py-3 text-sm font-semibold text-fire-ink">this event is cancelled</p>}
      <h1 className="text-[30px] leading-[34px] font-extrabold tracking-[-0.03em]">{ev.title}</h1>
      <EventFacts ev={ev} city={ev.city} />
      <p className="meta">
        {ev.host_handle && (
          <>
            hosted by{" "}
            <a href={`${CARD_URL}/@${ev.host_handle}`} className="hover:underline">
              {ev.host_name}
            </a>{" "}
            ·{" "}
          </>
        )}
        🙋 {ev.going} going{ev.here > 0 ? ` · 🎟 ${ev.here} checked in` : ""}
      </p>
      {!ev.cancelled && !over && (
        <div className="flex flex-col gap-2">
          {ev.registration_url && (
            <a href={ev.registration_url} target="_blank" rel="noopener" className={buttonClass("primary")}>
              register ↗
            </a>
          )}
          {viewer && (
            <a href={`${APP_URL}/events/${ev.slug}`} className={buttonClass(ev.registration_url ? "secondary" : "primary")}>
              open in the club
            </a>
          )}
        </div>
      )}
      {!viewer && (
        <section className="flex flex-col gap-1.5 rounded-[var(--radius-lg)] border border-line bg-surface p-5">
          <p className="font-extrabold">🤝 a 1handshake event</p>
          <p className="text-sm text-ink-muted">
            1handshake is a members-only club for people in tech. members check in with the host&apos;s qr and see everyone who came. not a member yet? meet one at the event — a selfie together gets you in.
          </p>
        </section>
      )}
      {ev.body_md && (
        <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5">
          <Markdown source={ev.body_md} />
        </section>
      )}
      <p className="meta text-center">
        {CARD_HOST}/e/{ev.slug} · <a href={`${CARD_URL}/`}>what is 1handshake</a>
      </p>
    </main>
  );
}
