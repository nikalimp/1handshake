/** The monoline 1h mark. Inherits colour from `currentColor`. */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label="1handshake">
      <g fill="none" stroke="currentColor" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 21 L23 15 L23 49" />
        <path d="M34 13 L34 49" />
        <path d="M34 33 C34 26.5 38.2 23 43.5 23 C48.8 23 52 26.5 52 33 L52 49" />
      </g>
    </svg>
  );
}
