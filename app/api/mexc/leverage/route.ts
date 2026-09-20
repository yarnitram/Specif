import { NextRequest, NextResponse } from "next/server";
import { fetchMaxLeverage } from "@/lib/mexc";

/**
 * GET /api/mexc/leverage?symbol=BTC_USDT
 *
 * Returns the MEXC Futures max leverage for a single contract, proxied
 * server-side (the MEXC REST API is not reliably CORS-friendly from the
 * browser). Returns { data: number | null }, where data is the contract's
 * maxLeverage (e.g. 500 for BTC_USDT).
 */
export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "").trim().toUpperCase();

  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol query param" }, { status: 400 });
  }

  const leverage = await fetchMaxLeverage(symbol);
  return NextResponse.json({ data: leverage });
}