import { NextRequest, NextResponse } from "next/server";
import {
  addTrade,
  findRecentTrade,
  listTrades,
  type OrderType,
  type Position,
  type TradeAlertType,
} from "@/lib/db";
import { fetchMaxLeverage } from "@/lib/mexc";

/**
 * GET /api/trades
 *
 * Returns the trade log (most recent first) - one row per fired alarm.
 */
export async function GET() {
  try {
    const rows = await listTrades();
    return NextResponse.json({ data: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * POST /api/trades
 *
 * Appends a trade row for a fired alarm. Called by the alarm engine in
 * <Terminal/> when a trigger / TP / SL level is hit.
 *
 * Body: { symbol, alertType, lastPrice, leverage?, orderType, position, entryPrice, tpPrice, slPrice }
 *
 * The leverage is resolved server-side from MEXC (maxLeverage for the contract)
 * unless the caller supplies one, and duplicate submissions for the same
 * symbol + alert type inside a 5s window are collapsed so React's StrictMode
 * double-invoked effects can't create two identical rows.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const symbol = typeof body?.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
    if (!symbol) {
      return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    }

    const alertType: TradeAlertType = (["TRIGGER", "TP", "SL"] as const).includes(body?.alertType)
      ? (body.alertType as TradeAlertType)
      : "TRIGGER";

    const orderType: OrderType = (["LIMIT", "MARKET", "TRIGGER_LIMIT"] as const).includes(
      body?.orderType
    )
      ? (body.orderType as OrderType)
      : "LIMIT";

    const position: Position = (["LONG", "SHORT"] as const).includes(body?.position)
      ? (body.position as Position)
      : "LONG";

    const toNum = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    // De-dupe: the same symbol/alert pair logged twice in a row is one trade.
    const recent = await findRecentTrade(symbol, alertType);
    if (recent) {
      return NextResponse.json({ data: recent, duplicate: true }, { status: 200 });
    }

    const leverage = toNum(body?.leverage) ?? (await fetchMaxLeverage(symbol));

    const row = await addTrade({
      symbol,
      alertType,
      lastPrice: toNum(body?.lastPrice),
      leverage,
      orderType,
      position,
      entryPrice: toNum(body?.entryPrice),
      tpPrice: toNum(body?.tpPrice),
      slPrice: toNum(body?.slPrice),
      margin: toNum(body?.margin),
    });

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
