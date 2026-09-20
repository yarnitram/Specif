import { NextRequest, NextResponse } from "next/server";
import { deleteTrade } from "@/lib/db";

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
