import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Position } from "./db";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a price with reasonable precision, monospace friendly. */
export function formatPrice(value: number | null | undefined, digits = 6): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: true,
  });
}

/** Format a percent. MEXC sends `riseFallRate` as a decimal ratio (e.g. -0.0026 -> -0.26%). */
export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(2)}%`;
}

/** Format a 24h volume amount (USDT) compactly, e.g. 1.23B / 456.7M. */
export function formatVolume(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value) || value <= 0) return "—";
  const abs = Math.abs(value);
  const units: Array<[number, string]> = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [div, suffix] of units) {
    if (abs >= div) {
      const n = value / div;
      return `${n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : 2 })}${suffix}`;
    }
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/**
 * Signed % move from an entry price to a level, side-aware: positive means the
 * level is in profit for that side (a LONG's TP sits above entry, a SHORT's below).
 * Used for the risk/reward read-out in the trade editor.
 */
export function pctFromEntry(
  position: Position,
  entry: number | null | undefined,
  level: number | null | undefined
): number | null {
  if (entry == null || level == null || entry === 0) return null;
  if (Number.isNaN(entry) || Number.isNaN(level)) return null;
  const move = position === "SHORT" ? (entry - level) / entry : (level - entry) / entry;
  return move * 100;
}

/**
 * Non-blocking heads-up when TP/SL sit on the wrong side of entry for the
 * selected side (a LONG takes profit above and stops out below, and vice versa).
 * Shared by the strategy planner and the trade editor.
 */
export function sideMismatch(
  position: Position,
  entry: number | null,
  tp: number | null,
  sl: number | null
): string | null {
  if (entry == null) return null;
  if (position === "LONG") {
    if (tp != null && tp <= entry) return "TP is at/below entry for a LONG";
    if (sl != null && sl >= entry) return "SL is at/above entry for a LONG";
    return null;
  }
  if (tp != null && tp >= entry) return "TP is at/above entry for a SHORT";
  if (sl != null && sl <= entry) return "SL is at/below entry for a SHORT";
  return null;
}

/** SQLite CURRENT_TIMESTAMP is UTC without a zone marker ("YYYY-MM-DD HH:MM:SS"). */
export function formatUtcTimestamp(value: string): string {
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
/**
 * Unrealized PNL for a trade row: side-aware, sized by margin x leverage.
 * Returns null when entry or lastPrice is missing.
 *
 *   positionValue = margin x leverage   (e.g. $1 x 50x = $50 notional)
 *   move = position === "SHORT"
 *            ? (entry - lastPrice) / entry
 *            : (lastPrice - entry) / entry
 *   pnl = move x positionValue           (positive = in profit)
 *   pnlPercent = move x 100              (vs position value)
 */
export function computeUnrealizedPnl(
  position: Position,
  entry: number | null,
  lastPrice: number | null,
  margin: number | null,
  leverage: number | null
): { pnl: number; pnlPercent: number; positionValue: number } | null {
  if (entry == null || lastPrice == null || margin == null || leverage == null) return null;
  if (!Number.isFinite(entry) || !Number.isFinite(lastPrice)) return null;
  if (entry === 0) return null;
  const positionValue = margin * leverage;
  const move = position === "SHORT"
    ? (entry - lastPrice) / entry
    : (lastPrice - entry) / entry;
  const pnl = move * positionValue;
  return { pnl, pnlPercent: move * 100, positionValue };
}
