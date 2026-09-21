import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Folks — Whitelist Checker",
  description: "Check whether a wallet is eligible for the Folks whitelist.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
