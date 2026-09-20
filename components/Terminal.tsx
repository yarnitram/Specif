"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { StrategyRow, TickerData, WatchlistJoined, NotificationSettings, GeneralSettings, TradeAlertType } from "@/lib/db";
import { fireAlert } from "@/lib/notifications";
import Header from "./Header";
import StatusBar from "./StatusBar";
import AddSymbolBar from "./AddSymbolBar";
import WatchlistTable from "./WatchlistTable";
import StrategyModal from "./StrategyModal";

type TerminalProps = {
  initialRows: WatchlistJoined[];
};

export default function Terminal({ initialRows }: TerminalProps) {
  const [rows, setRows] = useState<WatchlistJoined[]>(initialRows);
  const [editing, setEditing] = useState<WatchlistJoined | null>(null);
  const [ticks, setTicks] = useState<Record<string, TickerData>>({});
  const [polling, setPolling] = useState(false);
  const [lastTickAt, setLastTickAt] = useState<number | null>(null);
  const [notifSettings, setNotifSettings] = useState<NotificationSettings | null>(null);
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings | null>(null);

  // Track previous prices to detect crosses in either direction
  const prevPricesRef = useRef<Record<string, number>>({});

  const symbols = useMemo(() => rows.map((r) => r.symbol), [rows]);

  // Fetch notification settings on mount
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/notifications")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.data) setNotifSettings(json.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch general settings on mount
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/general")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.data) setGeneralSettings(json.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Live prices are refreshed via the public MEXC REST ticker endpoint on an
  // interval. (WebSocket is intentionally not used because the wss endpoint is
  // blocked / unreliable from many networks, which caused the "RECONNECTING"
  // loop. REST polling is reliable and gives us live-ish prices.)
  useEffect(() => {
    if (symbols.length === 0) return;
    let cancelled = false;
    const q = symbols.join(",");
    const controller = new AbortController();

    // Get poll interval from settings (default 4 seconds)
    const pollIntervalMs = (generalSettings?.pollIntervalSeconds ?? 4) * 1000;

    async function poll() {
      if (controller.signal.aborted) return;
      setPolling(true);
      try {
        const res = await fetch(`/api/mexc/tickers?symbols=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const json = await res.json();
        if (!cancelled && res.ok && json.data) {
          setTicks(json.data);
          setLastTickAt(Date.now());
        }
      } catch {
        /* best-effort; keep previous data on transient failures */
      } finally {
        if (!cancelled) setPolling(false);
      }
    }

    void poll();
    const id = setInterval(poll, pollIntervalMs);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(id);
    };
  }, [symbols.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Consider the feed "connected" if we received data within the last 12s.
  const connected = lastTickAt != null && Date.now() - lastTickAt < 12000;

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // -------------------------------------------------------------------------
  // Watchlist mutations
  // -------------------------------------------------------------------------

  const addSymbol = useCallback(async (symbol: string) => {
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to add symbol");
    // If the symbol is already in the watchlist, still open its editor.
    if (rowsRef.current.some((r) => r.symbol === json.data.symbol)) {
      toast.info("Symbol already in watchlist");
      setEditing(json.data);
      return;
    }
    setRows((prev) => [...prev, json.data]);
    toast.success(`Added ${json.data.symbol}`);
    // Open the strategy modal directly so the new coin's inputs can be set right away.
    setEditing(json.data);
  }, []);

  const removeSymbol = useCallback(async (row: WatchlistJoined) => {
    const res = await fetch(`/api/watchlist/${encodeURIComponent(row.symbol)}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "Failed to remove symbol");
      return;
    }
    toast.success(`Removed ${row.symbol}`);
    setRows((prev) => prev.filter((r) => r.symbol !== row.symbol));
  }, []);

  const reorder = useCallback(async (items: Array<{ symbol: string; sort_order: number }>) => {
    const res = await fetch("/api/watchlist/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to reorder");
    setRows((prev) =>
      [...prev].sort((a, b) => {
        const order = new Map(items.map((it) => [it.symbol, it.sort_order]));
        return (order.get(a.symbol) ?? 0) - (order.get(b.symbol) ?? 0);
      })
    );
  }, []);

  const handleSaved = useCallback((updated: WatchlistJoined) => {
    setRows((prev) => prev.map((r) => (r.symbol === updated.symbol ? updated : r)));
  }, []);

  // -------------------------------------------------------------------------
  // Real-time Strategy Alarm Engine
  // -------------------------------------------------------------------------
  // Compares live prices against stored targets and fires one-shot toasts,
  // then POSTs the fired flags so the alarm doesn't re-fire.

  const firedInFlight = useRef<Set<string>>(new Set());

  async function persistFiredFlags(symbol: string, strategy: StrategyRow, firedMarkers: string[]) {
    const res = await fetch("/api/strategy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol,
        triggerType: strategy.trigger_type ?? "ABOVE",
        triggerPrice: strategy.trigger_price,
        entryPrice: strategy.entry_price,
        tpPrice: strategy.tp_price,
        slPrice: strategy.sl_price,
        triggerFired:
          strategy.trigger_fired || firedMarkers.includes("trigger_fired"),
        tpFired: strategy.tp_fired || firedMarkers.includes("tp_fired"),
        slFired: strategy.sl_fired || firedMarkers.includes("sl_fired"),
      }),
    });
    const json = await res.json();
    // Clear in-flight markers for this symbol now that they've been persisted.
    firedMarkers.forEach((m) => firedInFlight.current.delete(`${symbol}:${m}`));
    if (!res.ok) {
      toast.error(json.error ?? "Failed to update alarms");
      return;
    }
    // Merge freshly-persisted flags into local rows so the UI reflects the alarm.
    setRows((prev) => prev.map((r) => (r.symbol === symbol ? { ...r, strategy: json.data ?? r.strategy } : r)));
  }

  /**
   * Appends a fired alarm to the trade log that backs the Trades page
   * (symbol, last price, leverage, order type, entry / TP / SL). The leverage
   * is resolved server-side from MEXC. Fire-and-forget: a failed log must never
   * block the alarm itself.
   */
  function logTrade(symbol: string, alertType: TradeAlertType, lastPrice: number, strategy: StrategyRow) {
    void fetch("/api/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol,
        alertType,
        lastPrice,
        orderType: strategy.order_type,
        entryPrice: strategy.entry_price,
        tpPrice: strategy.tp_price,
        slPrice: strategy.sl_price,
      }),
    }).catch((err) => {
      console.error("[trades] failed to log alert", err);
    });
  }

  // Run the real-time alarm engine whenever live prices update.
  useEffect(() => {
    const firedPerSymbol = new Map<string, string[]>();

    rowsRef.current.forEach((row) => {
      const s = row.strategy;
      if (!s) return;
      const tick = ticks[row.symbol];
      if (!tick) return;

      const last = tick.lastPrice;
      const fair = tick.fairPrice;
      const key = row.symbol;

      const fire = (marker: "trigger_fired" | "tp_fired" | "sl_fired", label: string) => {
        const full = `${key}:${marker}`;
        if (firedInFlight.current.has(full)) return;
        firedInFlight.current.add(full);
        if (!firedPerSymbol.has(key)) firedPerSymbol.set(key, []);
        firedPerSymbol.get(key)!.push(marker);
        toast.warning(`${key} · ${label} hit`, { description: `Last ${last} · Fair ${fair}` });
        // Fire desktop + Discord notifications
        if (notifSettings) void fireAlert(key, label, String(last), notifSettings);
        // Append the alarm to the trade log so it shows up on the Trades page.
        const alertType: TradeAlertType =
          marker === "tp_fired" ? "TP" : marker === "sl_fired" ? "SL" : "TRIGGER";
        logTrade(key, alertType, last, s);
      };

      // Trigger alarm - fires when price crosses trigger price in either direction
      if (s.trigger_price != null && !s.trigger_fired) {
        const triggerPrice = s.trigger_price;
        const prevPrice = prevPricesRef.current[key];
        
        // Detect cross in either direction
        const crossedUp = prevPrice != null && prevPrice < triggerPrice && last >= triggerPrice;
        const crossedDown = prevPrice != null && prevPrice > triggerPrice && last <= triggerPrice;
        
        if (crossedUp || crossedDown) {
          fire("trigger_fired", "TRIGGER HIT");
        }
      }
      // Take profit / stop loss based on fair price
      if (s.tp_price != null && !s.tp_fired && fair >= s.tp_price) fire("tp_fired", "TAKE PROFIT");
      if (s.sl_price != null && !s.sl_fired && fair <= s.sl_price) fire("sl_fired", "STOP LOSS");
    });

    // Persist any newly-fired flags to the DB so they don't re-fire.
    firedPerSymbol.forEach((markers, symbol) => {
      const row = rowsRef.current.find((r) => r.symbol === symbol);
      if (row?.strategy) void persistFiredFlags(symbol, row.strategy, markers);
    });

    // Update previous prices for next tick comparison
    rowsRef.current.forEach((row) => {
      const tick = ticks[row.symbol];
      if (tick) {
        prevPricesRef.current[row.symbol] = tick.lastPrice;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticks]);

  // -------------------------------------------------------------------------
  // Derived stats for header
  // -------------------------------------------------------------------------

  const stats = useMemo(() => {
    let active = 0;
    let fired = 0;
    rows.forEach((r) => {
      if (r.strategy) {
        active += 1;
        if (r.strategy.trigger_fired || r.strategy.tp_fired || r.strategy.sl_fired) fired += 1;
      }
    });
    return { symbols: rows.length, activeStrategies: active, fired };
  }, [rows]);

  return (
    <main className="min-h-screen bg-base text-slate-200">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
        <Header />
        <StatusBar
          connected={connected}
          reconnecting={!connected}
          lastMessageAt={lastTickAt}
          counts={stats}
        />
        <AddSymbolBar onAdd={addSymbol} />
        <WatchlistTable
          rows={rows}
          ticks={ticks}
          onReorder={reorder}
          onEdit={setEditing}
          onRemove={removeSymbol}
        />
        <footer className="pb-4 text-center text-[11px] text-slate-600 font-mono">
          Live data via MEXC REST · refreshed every 4s
        </footer>
      </div>

      {editing ? (
        <StrategyModal
          row={editing}
          tick={ticks[editing.symbol]}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      ) : null}
    </main>
  );
}