import type { MetadataRoute } from "next";

// Installable as an app: "add to home screen" on iPhone, "install" on Android and desktop Chrome.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "1handshake",
    short_name: "1handshake",
    description: "A members-only club for people in tech. Everyone you need is one handshake away.",
    start_url: "/feed",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F6F4EE",
    theme_color: "#F6F4EE",
    categories: ["social", "business"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
