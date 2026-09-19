import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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