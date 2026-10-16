"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/**
 * Records the microphone and turns it into text on the server (/api/transcribe).
 * Stops by itself after `maxSeconds`.
 */
export function useRecorder(onText: (text: string) => void, maxSeconds = 180) {
  const recorder = useRef<MediaRecorder | null>(null);
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(onText);
  useEffect(() => {
    done.current = onText;
  }, [onText]);

  useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);
  useEffect(() => {
    if (seconds >= maxSeconds && recorder.current?.state === "recording") recorder.current.stop();
  }, [seconds, maxSeconds]);
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
    },
    [],
  );

  const start = async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("microphone is off — allow it in the browser");
      return;
    }
    const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
    const r = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32000 });
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    r.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setSeconds(0);
      const blob = new Blob(chunks, { type: r.mimeType || type || "audio/webm" });
      if (blob.size < 2000) return setState("idle");
      setState("transcribing");
      try {
        const body = new FormData();
        body.append("audio", blob, "voice");
        const res = await fetch("/api/transcribe", { method: "POST", body });
        const json = (await res.json()) as { text?: string; error?: string };
        if (json.text) done.current(json.text.trim());
        else setError(json.error ?? "couldn't make out the recording. try again.");
      } catch {
        setError("couldn't send the recording. check the connection.");
      } finally {
        setState("idle");
      }
    };
    recorder.current = r;
    r.start();
    setState("recording");
  };

  const stop = () => recorder.current?.state === "recording" && recorder.current.stop();
  const supported = useSyncExternalStore(noSubscribe, () => typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia), () => false);
  return { state, seconds, error, start, stop, supported };
}
