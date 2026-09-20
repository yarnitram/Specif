"use client";

import Link from "next/link";

export default function TradesPage() {
  return (
    <main className="min-h-screen bg-base text-slate-200">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald/70 font-mono">Specif</p>
            <h1 className="mt-2 text-3xl font-bold text-white">Trades</h1>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-borderline bg-surface/60 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-emerald/50 hover:text-emerald"
          >
            Back to Terminal
          </Link>
        </div>

        <div className="rounded-2xl border border-borderline bg-surface/60 p-6 shadow-lg shadow-slate-950/20">
          <p className="text-slate-400">Trade activity will appear here.</p>
        </div>
      </div>
    </main>
  );
}
