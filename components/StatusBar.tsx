"use client";

import { Wifi, WifiOff, RefreshCw, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

type StatusBarProps = {
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

export default function StatusBar({ connected, reconnecting, lastMessageAt, counts }: StatusBarProps) {
  return (
    <div className="mx-auto flex w-full max-w-7xl justify-center">
      <div className="mt-4 flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-xl border border-borderline bg-surface/40 px-4 py-3">
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

        <div className="flex items-center gap-4 text-xs font-mono">
          <Stat label="Pairs" value={counts.symbols} />
          <Stat label="Strategies" value={counts.activeStrategies} />
          <Stat label="Fired" value={counts.fired} accent />
        </div>
      </div>
    </div>
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
