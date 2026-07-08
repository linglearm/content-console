import { NextRequest, NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/store";
import { serviceStatus } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({ settings, status: serviceStatus() });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const patch: { stock_target?: number; stock_threshold?: number } = {};
  if (Number.isFinite(body.stock_target)) patch.stock_target = Math.max(0, Math.round(body.stock_target));
  if (Number.isFinite(body.stock_threshold)) patch.stock_threshold = Math.max(0, Math.round(body.stock_threshold));
  const settings = await updateSettings(patch);
  return NextResponse.json({ settings });
}
