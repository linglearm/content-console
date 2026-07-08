import { NextRequest, NextResponse } from "next/server";
import { getBufferPlan } from "@/lib/content";
import { cronAuthorized } from "@/lib/cron";

export const dynamic = "force-dynamic";

/**
 * สถานะคิว buffer — ให้ Claude routine เรียกก่อนเขียนบทความ
 * คืน: needRefill (คิวเหลือ < minDays) + openSlots (ช่องเวลาว่างที่ควรเติม พร้อมเสาหลัก)
 * routine: ถ้า needRefill=true → เขียนโพสต์ให้แต่ละ openSlot แล้ว POST /api/ingest พร้อม scheduled_at
 * ต้องมี header x-cron-secret
 */
async function run(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const plan = await getBufferPlan();
    return NextResponse.json(plan);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
