import { NextRequest, NextResponse } from "next/server";
import { getGeneralSettings, setGeneralSettings } from "@/lib/db";

export async function GET() {
  const settings = await getGeneralSettings();
  return NextResponse.json({ data: settings });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  await setGeneralSettings(body);
  return NextResponse.json({ success: true });
}