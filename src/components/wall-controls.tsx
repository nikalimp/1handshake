"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { postToWall, removePost, toggleFire } from "@/app/(app)/people/actions";
import { Button } from "@/components/button";

export function WallComposer({ ownerId, placeholder }: { ownerId: string; placeholder: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-card)]"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const res = await postToWall(ownerId, text);
          if ("error" in res) setError(res.error);
          else {
            setText("");
            router.refresh();
          }
        });
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder={placeholder}
        aria-label="new post"
        className="w-full resize-none bg-transparent text-[15px] leading-[22px] outline-none placeholder:text-ink-muted"
      />
      {error && <p className="text-sm text-fire-ink">{error}</p>}
      <div className="flex justify-end">
        <Button size="sm" disabled={pending || !text.trim()}>
          {pending ? "posting…" : "post"}
        </Button>
      </div>
    </form>
  );
}

export function FireButton({ postId, fires, fired }: { postId: string; fires: number; fired: boolean }) {
  const [state, setState] = useState({ fires, fired });
  const [, start] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={state.fired}
      aria-label={state.fired ? "take back your fire" : "give a fire"}
      onClick={() => {
        const on = !state.fired;
        setState((s) => ({ fires: s.fires + (on ? 1 : -1), fired: on }));
        start(() => toggleFire(postId, on));
      }}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors ${state.fired ? "bg-fire-soft text-fire-ink" : "bg-surface-sunk text-ink-muted"}`}
    >
      <span className={state.fired ? "" : "grayscale"}>🔥</span>
      {state.fires > 0 && <span className="tabular-nums">{state.fires}</span>}
    </button>
  );
}

export function RemovePost({ postId }: { postId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await removePost(postId);
          router.refresh();
        })
      }
      className="meta hover:text-ink"
    >
      {pending ? "removing…" : "remove"}
    </button>
  );
}
