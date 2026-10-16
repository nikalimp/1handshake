import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import { THEME_SCRIPT } from "@/lib/theme";
import { SITE_URL } from "@/lib/env";

// Fonts are self-hosted (OFL): no requests to Google from members' browsers.
const figtree = localFont({
  variable: "--font-figtree",
  src: [{ path: "./fonts/figtree-latin-wght-normal.woff2", weight: "300 900", style: "normal" }],
  display: "swap",
});
const geistMono = localFont({
  variable: "--font-geist-mono",
  src: [
    { path: "./fonts/GeistMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/GeistMono-Medium.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "1handshake", template: "%s · 1handshake" },
  description: "A members-only club for people in tech. Everyone you need is one handshake away.",
  icons: { icon: "/1h-app-icon.svg" },
  appleWebApp: { capable: true, title: "1handshake", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F4EE" },
    { media: "(prefers-color-scheme: dark)", color: "#141311" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${figtree.variable} ${geistMono.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full">
        <Script id="theme" strategy="beforeInteractive">
          {THEME_SCRIPT}
        </Script>
        {children}
      </body>
    </html>
  );
}
