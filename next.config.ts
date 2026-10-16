import type { NextConfig } from "next";

// Public cards are also served at 1handshake.com/@handle through the site's proxy. Their HTML then
// comes from the site's domain, so in production the app's JS, CSS and fonts load from the app's own
// address. Not in dev or on Vercel previews, which serve their own files.
const assetPrefix = process.env.ASSET_PREFIX ?? (process.env.VERCEL_ENV === "production" ? "https://app.1handshake.com" : undefined);

// Once the main site serves the cards (NEXT_PUBLIC_CARD_URL=https://1handshake.com), cards and legal pages
// live only there: the app sends its own /@handle, /terms and /privacy over. The site proxies cards back
// to the app's internal /u/:handle path, so this never loops.
const cardUrl = (process.env.NEXT_PUBLIC_CARD_URL ?? "").replace(/\/$/, "");
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
const cardsOnMainSite = Boolean(cardUrl) && cardUrl !== appUrl;

const nextConfig: NextConfig = {
  assetPrefix,
  // Cache Components are off for now: every page reads the Supabase session cookie.
  // Turn them on later, page by page, following node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    if (!cardsOnMainSite) return [];
    return [
      { source: "/@:handle/llms.txt", destination: `${cardUrl}/@:handle/llms.txt`, permanent: true },
      { source: "/@:handle", destination: `${cardUrl}/@:handle`, permanent: true },
      { source: "/terms", destination: `${cardUrl}/terms`, permanent: true },
      { source: "/privacy", destination: `${cardUrl}/privacy`, permanent: true },
    ];
  },
  // Public visit cards: /@handle (and /@handle/llms.txt) are served by /u/:handle.
  async rewrites() {
    return [
      { source: "/@:handle/llms.txt", destination: "/u/:handle/llms.txt" },
      { source: "/@:handle", destination: "/u/:handle" },
    ];
  },
  // Fonts and scripts requested from 1handshake.com need CORS.
  async headers() {
    return [{ source: "/_next/static/:path*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] }];
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
};

export default nextConfig;
