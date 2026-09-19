import { NextRequest, NextResponse } from "next/server";
import { deleteStrategy } from "@/lib/db";
import { listWatchlist } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol: raw } = await ctx.params;
    const symbol = decodeURIComponent(raw);
    const joined = (await listWatchlist()).find((row) => row.symbol === symbol);
    return NextResponse.json({ data: joined?.strategy ?? null });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol: raw } = await ctx.params;
    const symbol = decodeURIComponent(raw);
    await deleteStrategy(symbol);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}