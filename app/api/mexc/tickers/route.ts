import { NextRequest, NextResponse } from "next/server";
import { fetchMexcTickers } from "@/lib/mexc";

/**
 * GET /api/mexc/tickers?symbols=BTC_USDT,ETH_USDT
 *
 * Returns a REST snapshot of MEXC Futures tickers. If a `symbols` query param is
 * provided (comma-separated), the response is filtered to just those symbols so
 * the client can warm up its price table with real data immediately.
 */
export async function GET(req: NextRequest) {
  const symbolsRaw = req.nextUrl.searchParams.get("symbols") ?? "";
  const wanted = new Set(
    symbolsRaw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
  );

  const full = await fetchMexcTickers();
  if (!full) {
    return NextResponse.json(
      { error: "Failed to fetch MEXC tickers" },
      { status: 502 }
    );
  }

  let data = full;
  if (wanted.size > 0) {
    data = {};
    for (const key of wanted) {
      if (full[key]) data[key] = full[key];
    }
  }

  return NextResponse.json({ data, count: Object.keys(data).length });
}