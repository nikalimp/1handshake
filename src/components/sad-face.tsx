/** Monoline sad face for "the code expired", drawn like the 1h mark. */
export function SadFace({ size = 72, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="32" cy="32" r="26" />
        <path d="M23 27 L23 28" />
        <path d="M41 27 L41 28" />
        <path d="M22 45 C25.5 40.5 38.5 40.5 42 45" />
      </g>
    </svg>
  );
}
