import { encode } from "uqr";

/**
 * QR code drawn as soft rounded modules with rounded finder eyes. Always dark on white, also in
 * dark mode: many phone scanners can't read inverted codes.
 * Error correction is H (30%), so the centre can carry the joint selfie.
 * The module shape and the 4-module quiet zone were picked by decoding test renders down to
 * 140px with blur; round dots looked nicer but failed to decode at small sizes.
 */
export function QrCode({ value, size = 280, centerSrc, centerAlt = "" }: { value: string; size?: number; centerSrc?: string | null; centerAlt?: string }) {
  const { data } = encode(value, { ecc: "H", border: 0 });
  const n = data.length;
  const quiet = 4;
  const box = n + quiet * 2;
  // Centre hole for the selfie: about a quarter of the code, aligned to the module grid.
  const hole = centerSrc ? Math.round(n * 0.26) | 1 : 0;
  const h0 = Math.floor((n - hole) / 2);
  const inHole = (x: number, y: number) => hole > 0 && x >= h0 - 1 && x < h0 + hole + 1 && y >= h0 - 1 && y < h0 + hole + 1;
  const inEye = (x: number, y: number) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);

  const r = 0.3; // corner radius of a module
  const side = 0.92 - 2 * r; // straight part of each edge
  const dots: string[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!data[y][x] || inEye(x, y) || inHole(x, y)) continue;
      const x0 = x + quiet + 0.04 + r;
      const y0 = y + quiet + 0.04;
      dots.push(`M${x0} ${y0}h${side}a${r} ${r} 0 0 1 ${r} ${r}v${side}a${r} ${r} 0 0 1 ${-r} ${r}h${-side}a${r} ${r} 0 0 1 ${-r} ${-r}v${-side}a${r} ${r} 0 0 1 ${r} ${-r}z`);
    }
  }
  const eyes = [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ].map(([x, y]) => [x + quiet, y + quiet]);

  return (
    <svg viewBox={`0 0 ${box} ${box}`} width={size} height={size} role="img" aria-label="invite code" className="block">
      <rect width={box} height={box} rx={3} fill="#fff" />
      <path d={dots.join("")} fill="#1a1814" />
      {eyes.map(([x, y]) => (
        <g key={`${x}-${y}`} fill="none" stroke="#1a1814">
          <rect x={x + 0.5} y={y + 0.5} width={6} height={6} rx={1.9} strokeWidth={1} />
          <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.9} fill="#1a1814" stroke="none" />
        </g>
      ))}
      {hole > 0 && centerSrc && (
        <>
          <defs>
            <clipPath id="qr-hole">
              <rect x={h0 + quiet} y={h0 + quiet} width={hole} height={hole} rx={hole * 0.22} />
            </clipPath>
          </defs>
          <image href={centerSrc} x={h0 + quiet} y={h0 + quiet} width={hole} height={hole} preserveAspectRatio="xMidYMid slice" clipPath="url(#qr-hole)">
            <title>{centerAlt}</title>
          </image>
        </>
      )}
    </svg>
  );
}
