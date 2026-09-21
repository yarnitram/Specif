import { NextRequest, NextResponse } from "next/server";
import { getTradesSettings, setTradesSettings } from "@/lib/db";

export async function GET() {
  const settings = await getTradesSettings();
  return NextResponse.json({ data: settings });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  await setTradesSettings(body);
  return NextResponse.json({ success: true });
}