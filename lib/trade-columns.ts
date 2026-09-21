/**
 * Browser-safe Trades table column metadata.
 *
 * This module must stay free of database / Node imports because it is used
 * directly by "use client" components. Keep server-side persistence in
 * `lib/db.ts`, which re-exports these constants.
 */

/** Canonical column keys for the Trades table, in display order. */
export const TRADES_COLUMNS = [
  "symbol",
  "position",
  "last_price",
  "leverage",
  "order_type",
  "entry_price",
  "tp_price",
  "sl_price",
  "position_value",
  "unrealized_pnl",
  "alert",
  "time",
  "actions",
] as const;

export type TradeColumnKey = (typeof TRADES_COLUMNS)[number];

/** Columns that can never be hidden — always shown. */
export const TRADES_ALWAYS_VISIBLE = ["symbol", "position", "actions"] as const;

export type TradeAlwaysVisibleKey = (typeof TRADES_ALWAYS_VISIBLE)[number];

/** Human-readable labels for each column key. */
export const COLUMN_LABELS: Record<TradeColumnKey, string> = {
  symbol: "Symbol",
  position: "Position",
  last_price: "Last Price",
  leverage: "Leverage",
  order_type: "Order Type",
  entry_price: "Entry Price",
  tp_price: "Take Profit",
  sl_price: "Stop Loss",
  position_value: "Position Value",
  unrealized_pnl: "Unrealized PNL",
  alert: "Alert",
  time: "Time",
  actions: "Actions",
};

export const ALWAYS_VISIBLE = new Set<string>(TRADES_ALWAYS_VISIBLE);
