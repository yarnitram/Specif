import type { TickerData } from "./db";

const MEXC_API_BASE = "https://contract.mexc.com/api/v1/contract";

export type MexcSymbolInfo = {
  symbol: string;
  baseCoin: string;
  displayNameEn: string;
  isHot: boolean;
  isNew: boolean;
};

let cachedSymbols: MexcSymbolInfo[] | null = null;
let cachedSymbolsAt = 0;

/**
 * Fetches the list of available MEXC Futures contracts for search suggestions.
 * The contract/detail endpoint is large, so the result is cached briefly.
 * Falls back to the last known list on transient failures.
 */
export async function fetchMexcSymbols(): Promise<MexcSymbolInfo[]> {
  // 5-minute cache.
  if (cachedSymbols && Date.now() - cachedSymbolsAt < 5 * 60 * 1000) {
    return cachedSymbols;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${MEXC_API_BASE}/detail`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[mexc] detail HTTP ${res.status}`);
      return cachedSymbols ?? [];
    }
    const json = (await res.json()) as { success?: boolean; data?: unknown };
    if (!json.success || !Array.isArray(json.data)) return cachedSymbols ?? [];

    const list: MexcSymbolInfo[] = (json.data as Record<string, unknown>[])
      .map((item) => ({
        symbol: String(item.symbol ?? ""),
        baseCoin: String(item.baseCoin ?? (item.symbol ?? "")),
        displayNameEn: String(item.displayNameEn ?? item.symbol ?? ""),
        isHot: Boolean(item.isHot),
        isNew: Boolean(item.isNew),
      }))
      .filter((s) => s.symbol.endsWith("_USDT"));

    cachedSymbols = list;
    cachedSymbolsAt = Date.now();
    return list;
  } catch (err) {
    console.error("[mexc] detail request failed", err);
    return cachedSymbols ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

export type MexcError = { success?: boolean; code?: number; message?: string };

/**
 * Fetches the full MEXC Futures ticker snapshot via REST.
 * Returns a map of symbol -> TickerData, or null on failure.
 *
 * This is used to populate prices immediately on page load, before the
 * WebSocket stream starts delivering updates.
 */
export async function fetchMexcTickers(): Promise<Record<string, TickerData> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${MEXC_API_BASE}/ticker`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[mexc] ticker HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { success?: boolean; data?: unknown };
    if (!json.success || !Array.isArray(json.data)) {
      console.error("[mexc] ticker response malformed", json);
      return null;
    }

    const map: Record<string, TickerData> = {};
    for (const item of json.data as Record<string, unknown>[]) {
      const t = parseRESTTicker(item);
      if (t) map[t.symbol] = t.tick;
    }
    return map;
  } catch (err) {
    console.error("[mexc] ticker request failed", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

type Parsed = { symbol: string; tick: TickerData };

/** Maps a single MEXC REST ticker object into our TickerData shape. */
function parseRESTTicker(raw: Record<string, unknown>): Parsed | null {
  const symbol = typeof raw.symbol === "string" ? raw.symbol : "";
  const num = (v: unknown): number | null => {
    if (typeof v !== "number" && typeof v !== "string") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const last = num(raw.lastPrice);
  if (!symbol || last == null) return null;

  return {
    symbol,
    tick: {
      lastPrice: last,
      riseFallRate: num(raw.riseFallRate) ?? 0,
      fairPrice: num(raw.fairPrice) ?? 0,
      indexPrice: num(raw.indexPrice) ?? 0,
      amount24: num(raw.amount24) ?? 0,
      holdVol: num(raw.holdVol) ?? 0,
      fundingRate: num(raw.fundingRate) ?? 0,
      high24Price: num(raw.high24Price) ?? 0,
      lower24Price: num(raw.lower24Price) ?? 0,
    },
  };
}