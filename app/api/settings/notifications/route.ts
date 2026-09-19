import { NextRequest, NextResponse } from "next/server";
import { getNotificationSettings, setNotificationSettings } from "@/lib/db";

export async function GET() {
  const settings = getNotificationSettings();
  return NextResponse.json({ data: settings });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  setNotificationSettings(body);
  return NextResponse.json({ success: true });
}