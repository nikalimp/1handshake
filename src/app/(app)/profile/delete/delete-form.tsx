"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, buttonClass } from "@/components/button";
import { deleteAccount } from "./actions";

export function DeleteForm({ handle }: { handle: string }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ready = text.trim().toLowerCase().replace(/^@/, "") === handle;
  return (
    <form
      className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-card)]"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        start(async () => {
          setError(null);
          const res = await deleteAccount(text);
          if (res && "error" in res) setError(res.error);
        });
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="meta">type @{handle} to confirm</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={`@${handle}`}
          className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3 outline-none focus:border-line-strong"
        />
      </label>
      {error && <p className="text-sm text-fire-ink">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" disabled={!ready || pending} className="flex-1">
          {pending ? "deleting…" : "delete my account"}
        </Button>
        <Link href="/profile/edit" className={buttonClass("ghost")}>
          keep it
        </Link>
      </div>
    </form>
  );
}
