import { NextRequest, NextResponse } from "next/server";
import { removeSymbol } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol: raw } = await ctx.params;
    const symbol = decodeURIComponent(raw);
    removeSymbol(symbol);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}