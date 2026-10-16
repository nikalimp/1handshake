import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  // Public visit cards live at 1handshake.com/@handle (and /@handle/llms.txt).
  async rewrites() {
    return [
      { source: "/@:handle/llms.txt", destination: "/u/:handle/llms.txt" },
      { source: "/@:handle", destination: "/u/:handle" },
    ];
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
};

export default nextConfig;
