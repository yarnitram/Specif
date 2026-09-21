"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Lock, Pen, Radio, Settings2, ShieldAlert, Target, Trash2, Zap } from "lucide-react";
import type { OrderType, TradeAlertType, TradeRow } from "@/lib/db";
import { TRADES_COLUMNS, ALWAYS_VISIBLE, COLUMN_LABELS } from "@/lib/trade-columns";
import { cn, formatPrice, computeUnrealizedPnl } from "@/lib/utils";
import PositionBadge from "./PositionBadge";

type TradesTableProps = {
  initialTrades: TradeRow[];
  visibleColumns: string[];
  onEdit?: (trade: TradeRow) => void;
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

export default function TradesTable({ initialTrades, visibleColumns, onEdit }: TradesTableProps) {
  const [trades, setTrades] = useState<TradeRow[]>(initialTrades);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(visibleColumns));
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Click-outside handler for the column visibility popover.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    }
    if (popoverOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [popoverOpen]);

  // Persist visible columns to the server whenever they change.
  useEffect(() => {
    const cols = TRADES_COLUMNS.filter((c) => ALWAYS_VISIBLE.has(c) || visibleCols.has(c));
    void (async () => {
      try {
        await fetch("/api/settings/trades", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visibleColumns: cols }),
        });
      } catch {
        /* best-effort; the UI state is already updated */
      }
    })();
  }, [visibleCols]);

  const isColumnVisible = (key: string): boolean => ALWAYS_VISIBLE.has(key) || visibleCols.has(key);

  function toggleColumn(key: string) {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

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
    <div className="overflow-visible rounded-2xl border border-borderline bg-surface/40 backdrop-blur">
      <div className="flex flex-col gap-2 border-b border-borderline p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-100">Trades</h1>
          <p className="text-xs text-slate-500 font-mono">
            {trades.length} logged {trades.length === 1 ? "alert" : "alerts"} · refreshed every{" "}
            {REFRESH_MS / 1000}s
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-borderline bg-base/60 px-2 py-1 text-[11px] font-semibold font-mono text-slate-400">
            <Radio className="h-3 w-3 text-emerald" />
            LIVE
          </span>
          <div ref={popoverRef} className="relative">
            <button
              type="button"
              onClick={() => setPopoverOpen((o) => !o)}
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-surface hover:text-emerald"
              aria-label="Column visibility"
              title="Show/hide columns"
            >
              <Settings2 className="h-4 w-4" />
            </button>
            {popoverOpen && (
              <div className="absolute top-full right-0 z-20 mt-2 w-56 rounded-lg border border-borderline bg-surface/95 shadow-xl backdrop-blur">
                <div className="border-b border-borderline px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Columns
                </div>
                <div className="max-h-72 overflow-y-auto p-1">
                  {TRADES_COLUMNS.map((col) => {
                    const canHide = !ALWAYS_VISIBLE.has(col);
                    const checked = isColumnVisible(col);
                    return (
                      <label
                        key={col}
                        className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm text-slate-300 hover:bg-surface/60"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!canHide}
                            onChange={() => canHide && toggleColumn(col)}
                            className="h-3.5 w-3.5 cursor-pointer rounded border-borderline bg-base/60 text-emerald focus:ring-1 focus:ring-emerald"
                          />
                          {COLUMN_LABELS[col]}
                        </span>
                        {!canHide && <Lock className="h-3 w-3 text-slate-500" />}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-b-2xl">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-b border-borderline text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3 font-semibold">Symbol</th>
              <th className="px-4 py-3 text-center font-semibold">Position</th>
              <th className={cn("px-4 py-3 text-right font-semibold", !isColumnVisible("last_price") && "hidden")}>Last Price</th>
              <th className={cn("px-4 py-3 text-center font-semibold", !isColumnVisible("leverage") && "hidden")}>Leverage</th>
              <th className={cn("px-4 py-3 text-center font-semibold", !isColumnVisible("order_type") && "hidden")}>Order Type</th>
              <th className={cn("px-4 py-3 text-right font-semibold", !isColumnVisible("entry_price") && "hidden")}>Entry Price</th>
              <th className={cn("px-4 py-3 text-right font-semibold", !isColumnVisible("tp_price") && "hidden")}>Take Profit</th>
              <th className={cn("px-4 py-3 text-right font-semibold", !isColumnVisible("sl_price") && "hidden")}>Stop Loss</th>
              <th className={cn("px-4 py-3 text-right font-semibold hidden sm:table-cell", !isColumnVisible("position_value") && "hidden")}>Position Value</th>
              <th className={cn("px-4 py-3 text-right font-semibold hidden sm:table-cell", !isColumnVisible("unrealized_pnl") && "hidden")}>Unrealized PNL</th>
              <th className={cn("px-4 py-3 text-center font-semibold", !isColumnVisible("alert") && "hidden")}>Alert</th>
              <th className={cn("hidden px-4 py-3 text-right font-semibold md:table-cell", !isColumnVisible("time") && "hidden")}>Time</th>
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
                  <td className="px-4 py-3 text-center">
                    <PositionBadge position={trade.position} />
                  </td>
                  <td className={cn("px-4 py-3 text-right", !isColumnVisible("last_price") && "hidden")}>
                    <PriceCell value={trade.last_price} />
                  </td>
                  <td className={cn("px-4 py-3 text-center font-mono text-sm tabular-nums text-slate-300", !isColumnVisible("leverage") && "hidden")}>
                    {trade.leverage != null ? `${trade.leverage}x` : "—"}
                  </td>
                  <td className={cn("px-4 py-3 text-center", !isColumnVisible("order_type") && "hidden")}>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold font-mono",
                        orderTypeStyles[trade.order_type] ?? "bg-surface text-slate-400"
                      )}
                    >
                      {trade.order_type.replace("_", " ")}
                    </span>
                  </td>
                  <td className={cn("px-4 py-3 text-right", !isColumnVisible("entry_price") && "hidden")}>
                    <PriceCell value={trade.entry_price} />
                  </td>
                  <td className={cn("px-4 py-3 text-right font-mono text-sm tabular-nums text-emerald", !isColumnVisible("tp_price") && "hidden")}>
                    {trade.tp_price != null ? formatPrice(trade.tp_price, 6) : "—"}
                  </td>
                  <td className={cn("px-4 py-3 text-right font-mono text-sm tabular-nums text-rose", !isColumnVisible("sl_price") && "hidden")}>
                    {trade.sl_price != null ? formatPrice(trade.sl_price, 6) : "—"}
                  </td>
                  <td className={cn("px-4 py-3 text-right font-mono text-sm tabular-nums hidden sm:table-cell", !isColumnVisible("position_value") && "hidden")}>
                    {trade.margin != null && trade.leverage != null
                      ? formatPrice(trade.margin * trade.leverage, 2)
                      : "—"}
                  </td>
                  <td className={cn("px-4 py-3 text-right font-mono text-sm tabular-nums hidden sm:table-cell", !isColumnVisible("unrealized_pnl") && "hidden")}>
                    {(() => {
                      const pnl = computeUnrealizedPnl(
                        trade.position,
                        trade.entry_price,
                        trade.last_price,
                        trade.margin,
                        trade.leverage
                      );
                      if (pnl == null) return "—";
                      const cls = pnl.pnl > 0 ? "text-emerald" : pnl.pnl < 0 ? "text-rose" : "text-slate-400";
                      return (
                        <span className={cls}>
                          {pnl.pnl > 0 ? "+" : ""}
                          {formatPrice(pnl.pnl, 2)}
                          <span className="text-[10px] opacity-60">
                            ({(pnl.pnlPercent).toFixed(2)}%)
                          </span>
                        </span>
                      );
                    })()}
                  </td>
                  <td className={cn("px-4 py-3 text-center", !isColumnVisible("alert") && "hidden")}>
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
                  <td className={cn("hidden px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-400 md:table-cell", !isColumnVisible("time") && "hidden")}>
                    {formatTradeTime(trade.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEdit?.(trade)}
                        title="Edit trade details"
                        className="rounded-md p-1.5 text-slate-400 transition hover:bg-emerald/10 hover:text-emerald"
                      >
                        <Pen className="h-4 w-4" />
                      </button>
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
