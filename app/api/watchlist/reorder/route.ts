import { NextRequest, NextResponse } from "next/server";
import { reorderSymbols } from "@/lib/db";

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const items = body?.items;
    if (!Array.isArray(items)) {
      return NextResponse.json({ error: "items array is required" }, { status: 400 });
    }
    const normalized = items.map((item: { symbol?: string; sort_order?: unknown }) => ({
      symbol: String(item?.symbol ?? ""),
      sort_order: Number(item?.sort_order ?? 0),
    }));
    await reorderSymbols(normalized);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}