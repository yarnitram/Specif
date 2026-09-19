import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MEXC Futures Terminal",
  description: "Real-time crypto watchlist & strategy planning terminal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#080b11] antialiased">{children}</body>
    </html>
  );
}