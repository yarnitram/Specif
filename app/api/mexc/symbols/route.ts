import { NextRequest, NextResponse } from "next/server";
import { fetchMexcSymbols } from "@/lib/mexc";

/**
 * GET /api/mexc/symbols?search=DOGE&limit=30
 *
 * Returns available MEXC Futures USDT contracts for the token picker.
 * `search` optionally filters by symbol / base-coin prefix; hot & new flags
 * are included so the UI can highlight them.
 */
export async function GET(req: NextRequest) {
  const search = (req.nextUrl.searchParams.get("search") ?? "").trim().toUpperCase();
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.min(100, Math.max(1, Number(limitRaw) || 30)) : 30;

  const all = await fetchMexcSymbols();
  let list = all;

  if (search) {
    // Match the base symbol prefix (e.g. DOGE) or the full USDT symbol.
    list = list.filter(
      (s) => s.baseCoin.startsWith(search) || s.symbol.startsWith(search)
    );
  }

  // Hot & new symbols float to the top, then alphabetical.
  const ranked = [...list].sort((a, b) => {
    const score = (s: { isHot: boolean; isNew: boolean }) =>
      (s.isHot ? 2 : 0) + (s.isNew ? 1 : 0);
    return score(b) - score(a) || a.symbol.localeCompare(b.symbol);
  });

  const top = search ? ranked.slice(0, limit) : ranked.slice(0, Math.min(limit, 60));

  return NextResponse.json({ data: top, count: top.length, total: all.length });
}