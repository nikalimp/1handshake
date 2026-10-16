import { initials } from "@/lib/utils";

export function Avatar({ name, size = 44, met = false, src }: { name: string | null; size?: number; met?: boolean; src?: string | null }) {
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center rounded-full bg-surface-sunk font-bold lowercase"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        initials(name)
      )}
      {met && (
        <span className="absolute -right-1 -bottom-1 grid h-[22px] w-[22px] place-items-center rounded-full bg-surface text-[11px] shadow-[0_0_0_2px_var(--paper)]" aria-label="met in person">
          🤝
        </span>
      )}
    </span>
  );
}
