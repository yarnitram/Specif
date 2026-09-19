import { NextRequest, NextResponse } from "next/server";
import { addSymbol, listWatchlist } from "@/lib/db";

export async function GET() {
  try {
    const rows = listWatchlist();
    return NextResponse.json({ data: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbol = typeof body?.symbol === "string" ? body.symbol : "";
    if (!symbol.trim()) {
      return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    }
    const row = addSymbol(symbol);
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}