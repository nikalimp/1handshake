import { SadFace } from "@/components/sad-face";

export function InviteProblem({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <SadFace className="text-ink-muted" />
      <h1 className="text-[26px] leading-[30px] font-extrabold">{title}</h1>
      {children ?? <p className="text-ink-muted">ask the member who invited you for a new handshake — it takes a few seconds.</p>}
    </main>
  );
}
