"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

export type RecorderPhase = "idle" | "recording" | "uploading" | "transcribing";

/**
 * Records the microphone and turns it into text on the server (/api/transcribe).
 * Exposes the phase, when it started, the real upload progress and the length of the recording,
 * so the UI can show honest progress. Stops by itself after `maxSeconds`.
 */
export function useRecorder(onText: (text: string, audioSeconds: number) => void, maxSeconds = 180) {
  const recorder = useRef<MediaRecorder | null>(null);
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [phaseAt, setPhaseAt] = useState(0);
  const [upload, setUpload] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [audioSeconds, setAudioSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(onText);
  useEffect(() => {
    done.current = onText;
  }, [onText]);

  const go = (p: RecorderPhase) => {
    setPhase(p);
    setPhaseAt(Date.now());
  };

  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => {
    if (seconds >= maxSeconds && recorder.current?.state === "recording") recorder.current.stop();
  }, [seconds, maxSeconds]);
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
    },
    [],
  );

  const send = (blob: Blob, length: number) =>
    new Promise<{ text?: string; error?: string }>((resolve) => {
      const body = new FormData();
      body.append("audio", blob, "voice");
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/transcribe");
      xhr.responseType = "json";
      xhr.upload.onprogress = (e) => e.lengthComputable && setUpload(e.loaded / e.total);
      // Upload finished: the server is now listening to the recording.
      xhr.upload.onload = () => {
        setUpload(null);
        go("transcribing");
      };
      xhr.onload = () => resolve((xhr.response as { text?: string; error?: string }) ?? { error: "couldn't make out the recording. try again." });
      xhr.onerror = () => resolve({ error: "couldn't send the recording. check the connection." });
      setAudioSeconds(length);
      setUpload(0);
      go("uploading");
      xhr.send(body);
    });

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
    const startedAt = Date.now();
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    r.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setSeconds(0);
      const length = (Date.now() - startedAt) / 1000;
      const blob = new Blob(chunks, { type: r.mimeType || type || "audio/webm" });
      if (blob.size < 2000) return go("idle");
      const res = await send(blob, length);
      go("idle");
      if (res.text) done.current(res.text.trim(), length);
      else setError(res.error ?? "couldn't make out the recording. try again.");
    };
    recorder.current = r;
    r.start();
    go("recording");
  };

  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  };
  const supported = useSyncExternalStore(noSubscribe, () => typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia), () => false);
  /** Rough time the server needs to transcribe this recording. */
  const transcribeMs = 2500 + audioSeconds * 120;
  return { phase, phaseAt, upload, seconds, audioSeconds, transcribeMs, error, setError, start, stop, supported };
}
