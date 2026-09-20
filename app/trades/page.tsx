"use client";

import Header from "@/components/Header";

export default function TradesPage() {
  return (
    <main className="min-h-screen bg-base text-slate-200">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
        <Header />

        <div className="rounded-2xl border border-borderline bg-surface/60 p-6 shadow-lg shadow-slate-950/20">
          <h1 className="text-2xl font-bold text-white">Trades</h1>
          <p className="mt-3 text-slate-400">Trade activity will appear here.</p>
        </div>
      </div>
    </main>
  );
}
