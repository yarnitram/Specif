"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Radio, ShieldAlert, Target, Trash2, Zap } from "lucide-react";
import type { OrderType, TradeAlertType, TradeRow } from "@/lib/db";
import { cn, formatPrice } from "@/lib/utils";

type TradesTableProps = {
  initialTrades: TradeRow[];
};

/** How often the table re-pulls the trade log from the API. */
const REFRESH_MS = 5000;

const alertStyles: Record<TradeAlertType, { label: string; className: string; Icon: typeof Zap }> = {
  TRIGGER: { label: "Trigger", className: "bg-amber-400/15 text-amber-400", Icon: Zap },
  TP: { label: "Take Profit", className: "bg-emerald/10 text-emerald", Icon: Target },
  SL: { label: "Stop Loss", className: "bg-rose/10 text-rose", Icon: ShieldAlert },
};

const orderTypeStyles: Record<OrderType, string> = {
  LIMIT: "bg-emerald/10 text-emerald",
  MARKET: "bg-amber-400/15 text-amber-400",
  TRIGGER_LIMIT: "bg-rose/10 text-rose",
};

/** SQLite CURRENT_TIMESTAMP is UTC without a zone marker ("YYYY-MM-DD HH:MM:SS"). */
function formatTradeTime(value: string): string {
  if (!value) return "—";
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function PriceCell({ value }: { value: number | null }) {
  if (value == null) return <span className="font-mono text-xs text-slate-600">—</span>;
  return <span className="font-mono text-sm tabular-nums text-slate-100">{formatPrice(value, 6)}</span>;
}

export default function TradesTable({ initialTrades }: TradesTableProps) {
  const [trades, setTrades] = useState<TradeRow[]>(initialTrades);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/trades", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.data) setTrades(json.data as TradeRow[]);
    } catch {
      /* best-effort; keep the previous rows on transient failures */
    }
  }, []);

  // Keep the page live: alerts fire on the watchlist page (possibly another tab),
  // so poll the trade log instead of relying on a manual reload.
  useEffect(() => {
    const id = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const removeTrade = useCallback(async (trade: TradeRow) => {
    try {
      const res = await fetch(`/api/trades/${trade.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to delete trade");
      setTrades((prev) => prev.filter((t) => t.id !== trade.id));
      toast.success(`Removed ${trade.symbol} entry`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete trade");
    }
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-borderline bg-surface/40 backdrop-blur">
      <div className="flex flex-col gap-2 border-b border-borderline p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-100">Trades</h1>
          <p className="text-xs text-slate-500 font-mono">
            {trades.length} logged {trades.length === 1 ? "alert" : "alerts"} · refreshed every{" "}
            {REFRESH_MS / 1000}s
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 self-start rounded-md border border-borderline bg-base/60 px-2 py-1 text-[11px] font-semibold font-mono text-slate-400 sm:self-auto">
          <Radio className="h-3 w-3 text-emerald" />
          LIVE
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-borderline text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3 font-semibold">Symbol</th>
              <th className="px-4 py-3 text-right font-semibold">Last Price</th>
              <th className="px-4 py-3 text-center font-semibold">Leverage</th>
              <th className="px-4 py-3 text-center font-semibold">Order Type</th>
              <th className="px-4 py-3 text-right font-semibold">Entry Price</th>
              <th className="px-4 py-3 text-right font-semibold">Take Profit</th>
              <th className="px-4 py-3 text-right font-semibold">Stop Loss</th>
              <th className="px-4 py-3 text-center font-semibold">Alert</th>
              <th className="hidden px-4 py-3 text-right font-semibold md:table-cell">Time</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => {
              const alert = alertStyles[trade.alert_type] ?? alertStyles.TRIGGER;
              const AlertIcon = alert.Icon;
              return (
                <tr key={trade.id} className="border-t border-borderline transition-colors hover:bg-surface/40">
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm font-semibold text-slate-100">{trade.symbol}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <PriceCell value={trade.last_price} />
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-sm tabular-nums text-slate-300">
                    {trade.leverage != null ? `${trade.leverage}x` : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold font-mono",
                        orderTypeStyles[trade.order_type] ?? "bg-surface text-slate-400"
                      )}
                    >
                      {trade.order_type.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <PriceCell value={trade.entry_price} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-emerald">
                    {trade.tp_price != null ? formatPrice(trade.tp_price, 6) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-rose">
                    {trade.sl_price != null ? formatPrice(trade.sl_price, 6) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold font-mono",
                        alert.className
                      )}
                    >
                      <AlertIcon className="h-3 w-3" />
                      {alert.label}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-400 md:table-cell">
                    {formatTradeTime(trade.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => void removeTrade(trade)}
                        title="Remove trade"
                        className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose/10 hover:text-rose"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {trades.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
          <div className="text-3xl">📈</div>
          <p className="text-sm text-slate-500">
            No trades logged yet. Alerts that fire on the watchlist appear here automatically.
          </p>
        </div>
      ) : null}
    </div>
  );
}
