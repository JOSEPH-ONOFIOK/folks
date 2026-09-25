import type { Metadata, Viewport } from "next";
import "./globals.css";

// Vercel sets VERCEL_URL per deployment; NEXT_PUBLIC_SITE_URL pins the real
// domain. Without one of these, OG images resolve against localhost.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://thefolks.xyz");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Folks — be your own type.",
  description: "10,000 characters for 10,000 folks. Mint on Robinhood Chain.",
  openGraph: {
    title: "Folks — be your own type.",
    description: "10,000 characters for 10,000 folks.",
    images: ["/folk-1.jpg"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Folks — be your own type.",
    description: "10,000 characters for 10,000 folks.",
    images: ["/folk-1.jpg"],
  },
};

// Without this, phones lay the page out at ~980px and zoom out.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
