import { NextRequest, NextResponse } from "next/server";
import {
  deleteTrade,
  updateTrade,
  type OrderType,
  type Position,
  type TradeAlertType,
  type UpdateTradeInput,
} from "@/lib/db";

/**
 * DELETE /api/trades/[id]
 *
 * Removes a single trade-log row (e.g. a noise entry the user wants gone).
 */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: raw } = await ctx.params;
    const id = Number(decodeURIComponent(raw));
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid trade id" }, { status: 400 });
    }
    await deleteTrade(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * PATCH /api/trades/[id]
 *
 * Edits what a trade row records: position, order type, alert type, leverage,
 * the captured last price, entry, take profit and stop loss.
 *
 * Keys that are absent from the body are left untouched; an explicit null (or
 * an empty string) clears a numeric field. Enum values are rejected rather than
 * coerced, since the user is deliberately correcting a recorded value.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: raw } = await ctx.params;
    const id = Number(decodeURIComponent(raw));
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid trade id" }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const input: UpdateTradeInput = {};
    // Writes go through a record cast, but the key set is the fixed whitelist
    // below, so arbitrary client keys can never reach the SQL.
    const writable = input as Record<string, unknown>;

    const numericFields: Array<[keyof UpdateTradeInput, unknown]> = [
      ["lastPrice", body.lastPrice],
      ["leverage", body.leverage],
      ["entryPrice", body.entryPrice],
      ["tpPrice", body.tpPrice],
      ["slPrice", body.slPrice],
      ["margin", body.margin],
    ];
    for (const [key, value] of numericFields) {
      if (!(key in body)) continue; // omitted -> leave that column alone
      if (value === null || value === "") {
        writable[key] = null; // explicit clear
        continue;
      }
      const n = Number(value);
      if (!Number.isFinite(n)) {
        return NextResponse.json({ error: `${key} must be a number` }, { status: 400 });
      }
      writable[key] = n;
    }

    if ("alertType" in body) {
      if (!(["TRIGGER", "TP", "SL"] as string[]).includes(body.alertType as string)) {
        return NextResponse.json({ error: "Invalid alertType" }, { status: 400 });
      }
      input.alertType = body.alertType as TradeAlertType;
    }

    if ("orderType" in body) {
      if (!(["LIMIT", "MARKET", "TRIGGER_LIMIT"] as string[]).includes(body.orderType as string)) {
        return NextResponse.json({ error: "Invalid orderType" }, { status: 400 });
      }
      input.orderType = body.orderType as OrderType;
    }

    if ("position" in body) {
      if (!(["LONG", "SHORT"] as string[]).includes(body.position as string)) {
        return NextResponse.json({ error: "Invalid position" }, { status: 400 });
      }
      input.position = body.position as Position;
    }

    const updated = await updateTrade(id, input);
    if (!updated) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    return NextResponse.json({ data: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}