"use client";

import { Wifi, WifiOff, RefreshCw, Activity, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

type HeaderProps = {
  connected: boolean;
  reconnecting: boolean;
  lastMessageAt: number | null;
  counts: {
    symbols: number;
    activeStrategies: number;
    fired: number;
  };
};

function relativeTime(ts: number | null): string {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  if (diff < 1000) return "now";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  return `${min}m ago`;
}

export default function Header({ connected, reconnecting, lastMessageAt, counts }: HeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-borderline bg-surface/60 p-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald to-teal-500 text-base font-black text-black">
          MX
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-100">
            MEXC Futures Terminal
          </h1>
          <p className="text-xs text-slate-500 font-mono">Watchlist &amp; Strategy Planning</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {/* Connection badge */}
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-mono",
            connected
              ? "border-emerald/40 bg-emerald/10 text-emerald"
              : "border-rose/40 bg-rose/10 text-rose"
          )}
        >
          {reconnecting && !connected ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> RECONNECTING
            </>
          ) : connected ? (
            <>
              <Wifi className="h-3.5 w-3.5" /> LIVE
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5" /> OFFLINE
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
          <Activity className="h-3.5 w-3.5" />
          <span className="text-slate-400">tick:</span> {relativeTime(lastMessageAt)}
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <Stat label="Pairs" value={counts.symbols} />
          <Stat label="Strategies" value={counts.activeStrategies} />
          <Stat label="Fired" value={counts.fired} accent />
        </div>

        <Link
          href="/settings"
          className="rounded-lg p-2 text-slate-400 hover:bg-surface hover:text-emerald transition"
          title="Settings"
        >
          <Settings className="h-5 w-5" />
        </Link>
      </div>
    </header>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="text-center">
      <div className={cn("text-sm font-bold tabular-nums", accent ? "text-amber-400" : "text-slate-100")}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  );
}