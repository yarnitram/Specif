import { NextRequest, NextResponse } from "next/server";
import {
  upsertStrategy,
  type UpsertStrategyInput,
  type OrderType,
  type Position,
  type TriggerDirection,
} from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const symbol = typeof body?.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
    if (!symbol) {
      return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    }

    const toNum = (v: unknown): number | null =>
      v === null || v === undefined || v === "" ? null : Number(v);

    const orderType = (["LIMIT", "MARKET", "TRIGGER_LIMIT"] as const).includes(body?.orderType)
      ? (body.orderType as OrderType)
      : "LIMIT";

    // Which crossing arms the trigger. The modal snapshots this from the live
    // last price at save time; callers that don't send one fall back to "BOTH"
    // (fire on a cross in either direction).
    const triggerDirection: TriggerDirection = (["ABOVE", "BELOW", "BOTH"] as const).includes(
      body?.triggerDirection
    )
      ? (body.triggerDirection as TriggerDirection)
      : "BOTH";

    const position: Position = (["LONG", "SHORT"] as const).includes(body?.position)
      ? (body.position as Position)
      : "LONG";

    const input: UpsertStrategyInput = {
      symbol,
      triggerType: body?.triggerType === "BELOW" ? "BELOW" : "ABOVE", // kept for DB compatibility, not used in new logic
      triggerPrice: toNum(body?.triggerPrice),
      entryPrice: toNum(body?.entryPrice),
      tpPrice: toNum(body?.tpPrice),
      slPrice: toNum(body?.slPrice),
      orderType,
      position,
      triggerDirection,
      triggerFired: Boolean(body?.triggerFired),
      tpFired: Boolean(body?.tpFired),
      slFired: Boolean(body?.slFired),
    };

    const row = await upsertStrategy(input);
    return NextResponse.json({ data: row }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}