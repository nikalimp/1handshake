"use client";
import { useEffect, useState } from "react";
import { dropPushSubscription, savePushSubscription } from "@/app/(app)/push-actions";
import { Button } from "@/components/button";
import { VAPID_PUBLIC_KEY } from "@/lib/push-public";

type State = "loading" | "unsupported" | "install-first" | "off" | "on" | "blocked" | "dismissed";
type InstallEvent = Event & { prompt: () => Promise<void> };

const DISMISS_KEY = "1h-push-dismissed";
const key = () => {
  const b64 = (VAPID_PUBLIC_KEY + "=".repeat((4 - (VAPID_PUBLIC_KEY.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

async function detect(): Promise<State> {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return ios && !standalone() ? "install-first" : "unsupported";
  const reg = await navigator.serviceWorker.register("/sw.js");
  if (Notification.permission === "denied") return "blocked";
  const sub = await reg.pushManager.getSubscription();
  if (Notification.permission === "granted") {
    // Granted earlier: make sure the server knows this device (e.g. after signing in as someone else).
    const s = sub ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key() }));
    await savePushSubscription(s.toJSON());
    return "on";
  }
  try {
    const until = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (until > Date.now()) return "dismissed";
  } catch {}
  return "off";
}

/**
 * Notifications in the browser (and the "install the app" nudge).
 * "card" sits at the top of the feed until handled; "row" lives in profile settings.
 */
export function PushCard({ variant = "card" }: { variant?: "card" | "row" }) {
  const [state, setState] = useState<State>("loading");
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    detect().then(setState, () => setState("unsupported"));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const turnOn = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "blocked" : "off");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key() }));
      const res = await savePushSubscription(sub.toJSON());
      setState("error" in res ? "off" : "on");
    } catch {
      setState("off");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await dropPushSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
    setState("off");
    setBusy(false);
  };

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 14 * 24 * 3600 * 1000));
    } catch {}
    setState("dismissed");
  };

  if (variant === "row") {
    if (state === "loading") return null;
    return (
      <div className="flex items-start justify-between gap-4 py-3">
        <span>
          <span className="block font-semibold">notifications</span>
          <span className="block text-sm text-ink-muted">
            {state === "on"
              ? "on for this device · intro requests, answers, wall posts"
              : state === "blocked"
                ? "blocked in your browser settings for this site"
                : state === "install-first"
                  ? "on iphone: share → add to home screen, then open 1handshake from there"
                  : state === "unsupported"
                    ? "this browser can't show notifications"
                    : "off for this device"}
          </span>
        </span>
        {(state === "off" || state === "dismissed") && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={turnOn}>
            turn on
          </Button>
        )}
        {state === "on" && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={turnOff}>
            turn off
          </Button>
        )}
      </div>
    );
  }

  if (state === "loading" || state === "on" || state === "dismissed" || state === "blocked" || state === "unsupported") {
    if (!install || standalone()) return null;
    return (
      <div className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]">
        <span className="text-sm">install 1handshake as an app — one tap from your home screen</span>
        <Button size="sm" variant="secondary" onClick={() => install.prompt().then(() => setInstall(null))}>
          install
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-card)]">
      <div>
        <p className="font-semibold">🔔 know when someone wants to meet you</p>
        <p className="text-sm text-ink-muted">
          {state === "install-first"
            ? "on iphone, notifications work in the app: tap share → add to home screen, then open 1handshake from there."
            : "a notification when someone asks for an intro, answers yours, or writes on your wall. nothing else."}
        </p>
      </div>
      <div className="flex gap-2">
        {state === "off" && (
          <Button size="sm" disabled={busy} onClick={turnOn}>
            {busy ? "turning on…" : "turn on notifications"}
          </Button>
        )}
        {install && (
          <Button size="sm" variant="secondary" onClick={() => install.prompt().then(() => setInstall(null))}>
            install app
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={dismiss}>
          not now
        </Button>
      </div>
    </div>
  );
}
