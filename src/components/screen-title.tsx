import type { ReactNode } from "react";

export function ScreenTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3 px-0.5 pt-6 pb-4">
      <h1 className="text-[32px] leading-9 font-extrabold tracking-[-0.03em]">{title}</h1>
      {children}
    </header>
  );
}
