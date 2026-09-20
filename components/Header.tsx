"use client";

import { Settings } from "lucide-react";
import Link from "next/link";

export default function Header() {
  return (
    <header className="rounded-2xl border border-borderline bg-surface/60 p-4 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald to-teal-500 text-base font-black text-black">
            S
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-100">Specif</h1>
            <p className="text-xs text-slate-500 font-mono">Watchlist &amp; Strategy Planning</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-surface hover:text-emerald"
          >
            Watchlist
          </Link>

          <Link
            href="/trades"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-surface hover:text-emerald"
          >
            Trades
          </Link>

          <Link
            href="/settings"
            className="rounded-lg p-2 text-slate-400 hover:bg-surface hover:text-emerald transition"
            title="Settings"
          >
            <Settings className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </header>
  );
}