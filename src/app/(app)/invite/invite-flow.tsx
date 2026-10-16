"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Button, buttonClass } from "@/components/button";
import { Confetti } from "@/components/confetti";
import { QrCode } from "@/components/qr-code";
import { SadFace } from "@/components/sad-face";
import { fileToSquareJpeg, squareJpeg } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";
import { tidySelfies } from "./actions";

type Invite = {
  id: string;
  code: string;
  status: "live" | "scanned" | "joined" | "expired" | "cancelled";
  guest_step: "welcome" | "about" | "card" | "done" | null;
  expires_at: string;
  joined_user_id: string | null;
};
type Guest = { name: string | null; handle: string | null };
type Selfie = { path: string; url: string };
type Phase = "camera" | "making" | "code" | "waiting" | "joined" | "expired";

const STEPS = [
  { key: "welcome", label: "opened your invite" },
  { key: "about", label: "telling about themselves" },
  { key: "card", label: "reviewing their card" },
  { key: "done", label: "joined the club" },
] as const;

export function InviteFlow({ uid }: { uid: string }) {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const [phase, setPhase] = useState<Phase>("camera");
  const [selfie, setSelfie] = useState<Selfie | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [error, setError] = useState<string | null>(null);

  // One code for this selfie (an older live code of mine is cancelled by the database).
  const makeCode = useCallback(
    async (s: Selfie) => {
      setPhase("making");
      setError(null);
      const { data, error } = await supabase.rpc("create_invite", { p_selfie_path: s.path }).single<Invite>();
      if (error || !data) {
        setError("couldn't make a code. check your connection and try again.");
        setPhase("camera");
        return;
      }
      setInvite(data);
      setGuest(null);
      setPhase("code");
      void tidySelfies();
    },
    [supabase],
  );

  const onPhoto = useCallback(
    async (blob: Blob) => {
      setPhase("making");
      setError(null);
      const path = `${uid}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("selfies").upload(path, blob, { contentType: "image/jpeg" });
      if (error) {
        setError("couldn't upload the selfie. try again.");
        setPhase("camera");
        return;
      }
      if (selfie) URL.revokeObjectURL(selfie.url);
      const s = { path, url: URL.createObjectURL(blob) };
      setSelfie(s);
      await makeCode(s);
    },
    [makeCode, selfie, supabase, uid],
  );

  // Follow the guest: realtime for instant updates, polling as a fallback.
  const apply = useCallback(
    async (row: Invite) => {
      setInvite(row);
      if (row.status === "scanned") setPhase((p) => (p === "code" ? "waiting" : p));
      if (row.status === "joined" && row.joined_user_id) {
        const { data } = await supabase.from("profiles").select("name, handle").eq("id", row.joined_user_id).maybeSingle<Guest>();
        setGuest(data ?? { name: "your guest", handle: null });
        setPhase("joined");
      }
      if (row.status === "expired") setPhase("expired");
    },
    [supabase],
  );

  const inviteId = invite?.id;
  const watching = phase === "code" || phase === "waiting";
  useEffect(() => {
    if (!inviteId || !watching) return;
    const channel = supabase
      .channel(`invite:${inviteId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "invites", filter: `id=eq.${inviteId}` }, (payload) => {
        void apply(payload.new as Invite);
      })
      .subscribe();
    const poll = setInterval(async () => {
      const { data } = await supabase.from("invites").select("id, code, status, guest_step, expires_at, joined_user_id").eq("id", inviteId).maybeSingle<Invite>();
      if (data) void apply(data);
    }, 4000);
    return () => {
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [apply, inviteId, supabase, watching]);

  // Before declaring the code dead, ask the database once: the guest may have scanned it
  // in the last seconds and the poll hasn't caught up yet.
  const onTimerEnd = useCallback(async () => {
    if (!inviteId) return;
    const { data } = await supabase.from("invites").select("id, code, status, guest_step, expires_at, joined_user_id").eq("id", inviteId).maybeSingle<Invite>();
    if (data && data.status !== "live") void apply(data);
    else setPhase("expired");
  }, [apply, inviteId, supabase]);

  // A new selfie means a new code: the old one must not stay scannable.
  const restart = () => {
    if (invite && (invite.status === "live" || invite.status === "scanned")) void supabase.rpc("cancel_invite", { p_invite: invite.id });
    setInvite(null);
    setGuest(null);
    setPhase("camera");
  };

  return (
    <div className="flex flex-col">
      {(phase === "camera" || (phase === "making" && !invite)) && (
        <SelfieStep busy={phase === "making"} error={error} onPhoto={onPhoto} onCancel={() => router.push("/connect")} />
      )}
      {phase === "making" && invite && <p className="pt-24 text-center font-semibold text-ink-muted">making a new code…</p>}
      {phase === "code" && invite && selfie && (
        <CodeStep
          invite={invite}
          selfie={selfie}
          onExpired={onTimerEnd}
          onRetake={restart}
        />
      )}
      {phase === "waiting" && invite && (
        <WaitingStep
          invite={invite}
          onCancel={async () => {
            await supabase.rpc("cancel_invite", { p_invite: invite.id });
            router.push("/connect");
          }}
        />
      )}
      {phase === "joined" && guest && <JoinedStep guest={guest} onAgain={restart} />}
      {phase === "expired" && (
        <ExpiredStep onSameSelfie={selfie ? () => makeCode(selfie) : undefined} onRetake={restart} error={error} />
      )}
    </div>
  );
}

function Title({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="px-0.5 pt-6 pb-5">
      <h1 className="text-[32px] leading-9 font-extrabold tracking-[-0.03em]">{title}</h1>
      {sub && <p className="mt-1.5 text-ink-muted">{sub}</p>}
    </header>
  );
}

function SelfieStep({ busy, error, onPhoto, onCancel }: { busy: boolean; error: string | null; onPhoto: (b: Blob) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState<"starting" | "on" | "off">("starting");
  const [shotError, setShotError] = useState(false);
  const shoot = async (make: () => Promise<Blob>) => {
    setShotError(false);
    try {
      onPhoto(await make());
    } catch {
      setShotError(true);
    }
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera api");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play().catch(() => {});
        }
        setCamera("on");
      } catch {
        if (!cancelled) setCamera("off");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <>
      <Title title="take a selfie together" sub="both faces in the square. this photo becomes their invite." />
      <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-lg)] bg-surface-sunk">
        <video ref={video} playsInline muted className={`h-full w-full -scale-x-100 object-cover ${camera === "on" ? "" : "hidden"}`} />
        {camera !== "on" && (
          <div className="absolute inset-0 grid place-items-center p-8 text-center text-ink-muted">
            {camera === "starting" ? "starting the camera…" : "the camera isn't available here. take the selfie with your phone camera and pick it below."}
          </div>
        )}
        {busy && <div className="absolute inset-0 grid place-items-center bg-paper/70 font-semibold backdrop-blur-sm">making your code…</div>}
      </div>
      {(error || shotError) && (
        <p role="alert" className="mt-3 rounded-[var(--radius-md)] bg-fire-soft px-4 py-3 text-sm text-fire-ink">
          {error ?? "couldn't read that photo. try again or pick another one."}
        </p>
      )}
      <div className="mt-5 flex flex-col gap-3">
        {camera === "on" ? (
          <Button
            disabled={busy}
            onClick={() => {
              const v = video.current;
              if (v && v.videoWidth > 0) void shoot(() => squareJpeg(v, { mirror: true }));
            }}
          >
            take selfie
          </Button>
        ) : (
          <Button disabled={busy} onClick={() => file.current?.click()}>
            pick a selfie
          </Button>
        )}
        <input
          ref={file}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void shoot(() => fileToSquareJpeg(f));
          }}
        />
        <div className="flex justify-center gap-2">
          {camera === "on" && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => file.current?.click()}>
              pick from photos
            </Button>
          )}
          <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
            cancel
          </Button>
        </div>
      </div>
    </>
  );
}

function useCountdown(until: string) {
  const end = new Date(until).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, end - now);
}

function CodeStep({ invite, selfie, onExpired, onRetake }: { invite: Invite; selfie: Selfie; onExpired: () => void; onRetake: () => void }) {
  const left = useCountdown(invite.expires_at);
  const ended = useRef(false);
  const total = 5 * 60 * 1000;
  const [origin] = useState(() => window.location.origin);
  const url = `${origin}/i/${invite.code}`;

  useEffect(() => {
    if (left > 0 || ended.current) return;
    ended.current = true;
    onExpired();
  }, [left, onExpired]);

  const s = Math.ceil(left / 1000);
  const clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <>
      <Title title="show this to them" sub="they scan it with their phone camera. one person, one code." />
      <div className="flex flex-col items-center gap-4 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-card)]">
        <QrCode value={url} size={272} centerSrc={selfie.url} centerAlt="your selfie together" />
        <div className="flex w-full flex-col items-center gap-2">
          <span className="font-mono text-[32px] leading-9 font-medium tabular-nums">{clock}</span>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunk">
            <div className="h-full rounded-full bg-fire transition-[width] duration-300 ease-linear" style={{ width: `${(left / total) * 100}%` }} />
          </div>
          <span className="meta">expires in 5 minutes · single use</span>
        </div>
      </div>
      <p className="meta mt-3 text-center break-all">{url.replace(/^https?:\/\//, "")}</p>
      <div className="mt-4 flex justify-center">
        <Button variant="ghost" size="sm" onClick={onRetake}>
          retake selfie
        </Button>
      </div>
    </>
  );
}

function WaitingStep({ invite, onCancel }: { invite: Invite; onCancel: () => void }) {
  const at = STEPS.findIndex((st) => st.key === (invite.guest_step ?? "welcome"));
  return (
    <>
      <Title title="they scanned it" sub="waiting while they join the club" />
      <ol className="flex flex-col gap-1 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-card)]">
        {STEPS.map((st, i) => {
          const done = i < at || (i === at && st.key === "done");
          const current = i === at && !done;
          return (
            <li key={st.key} className="flex items-center gap-3 py-2.5">
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${
                  done ? "bg-fire text-on-fire" : current ? "shadow-[inset_0_0_0_2px_var(--fire)]" : "shadow-[inset_0_0_0_1.5px_var(--line-strong)]"
                }`}
              >
                {done ? "✓" : current ? <span className="h-2 w-2 animate-pulse rounded-full bg-fire" /> : ""}
              </span>
              <span className={done || current ? "font-semibold" : "text-ink-muted"}>{st.label}</span>
            </li>
          );
        })}
      </ol>
      <div className="mt-5 flex justify-center">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          cancel invite
        </Button>
      </div>
    </>
  );
}

function JoinedStep({ guest, onAgain }: { guest: Guest; onAgain: () => void }) {
  return (
    <>
      <Confetti />
      <div className="flex flex-col items-center gap-4 px-2 pt-16 text-center">
        <Avatar name={guest.name} size={96} met />
        <h1 className="text-[30px] leading-[34px] font-extrabold tracking-[-0.03em]">{guest.name} joined the club</h1>
        <p className="text-ink-muted">you&apos;re connected 🤝 your network just grew by one handshake.</p>
        <div className="mt-4 flex w-full flex-col gap-3">
          {guest.handle && (
            <Link href={`/people/${guest.handle}`} className={buttonClass("primary")}>
              open profile
            </Link>
          )}
          <Button variant="secondary" onClick={onAgain}>
            invite someone else
          </Button>
        </div>
      </div>
    </>
  );
}

function ExpiredStep({ onSameSelfie, onRetake, error }: { onSameSelfie?: () => void; onRetake: () => void; error: string | null }) {
  return (
    <div className="flex flex-col items-center gap-4 px-2 pt-16 text-center">
      <SadFace className="text-ink-muted" />
      <h1 className="text-[30px] leading-[34px] font-extrabold tracking-[-0.03em]">the code expired</h1>
      <p className="text-ink-muted">nobody scanned it in 5 minutes. no worries — make a new one.</p>
      {error && (
        <p role="alert" className="text-sm text-fire-ink">
          {error}
        </p>
      )}
      <div className="mt-4 flex w-full flex-col gap-3">
        {onSameSelfie && <Button onClick={onSameSelfie}>new code, same selfie</Button>}
        <Button variant="secondary" onClick={onRetake}>
          retake selfie
        </Button>
      </div>
    </div>
  );
}
