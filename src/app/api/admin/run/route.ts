import { NextRequest, NextResponse } from "next/server";
import { publishDue, stockCheck } from "@/lib/content";

export const dynamic = "force-dynamic";

/**
 * ปุ่ม "รันเดี๋ยวนี้" ในหลังบ้าน (เรียกฟังก์ชันฝั่ง server ตรงๆ)
 * แยกจาก /api/publish-due และ /api/stock-check ที่สงวนไว้ให้ cron ภายนอกใช้ + ต้องมี secret
 */
export async function POST(req: NextRequest) {
  try {
    const { task } = await req.json().catch(() => ({ task: "" }));
    if (task === "publish") {
      const published = await publishDue();
      return NextResponse.json({ ok: true, publishedCount: published.length });
    }
    if (task === "stock") {
      const result = await stockCheck();
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json({ error: "task ต้องเป็น 'publish' หรือ 'stock'" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
