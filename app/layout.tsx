import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Specif",
  description: "Real-time crypto watchlist & strategy planning terminal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#080b11] antialiased">
        {children}
        {/* Mounted once for every route so toasts also work on /trades and /settings. */}
        <Toaster
          position="top-right"
          theme="dark"
          toastOptions={{
            style: {
              background: "#0f172a",
              border: "1px solid #1e293b",
              color: "#e2e8f0",
              fontFamily: "ui-monospace, monospace",
            },
          }}
        />
      </body>
    </html>
  );
}