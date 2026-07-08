import { NextRequest, NextResponse } from "next/server";
import { stockCheck } from "@/lib/content";

export const dynamic = "force-dynamic";

/**
 * ปุ่ม "รันเดี๋ยวนี้" ในหลังบ้าน — เหลือแค่ "เช็กสต็อก" เท่านั้น
 * การปล่อยโพสต์ (publish) ถูกล็อกให้ทำผ่าน Vercel Cron (/api/publish-due) เท่านั้น
 * เพื่อกันการโพสต์แบบ manual — ทุกโพสต์ต้องขึ้นตามเวลาในคิว schedule
 */
export async function POST(req: NextRequest) {
  try {
    const { task } = await req.json().catch(() => ({ task: "" }));
    if (task === "stock") {
      const result = await stockCheck();
      return NextResponse.json({ ok: true, ...result });
    }
    if (task === "publish") {
      return NextResponse.json(
        { error: "การปล่อยโพสต์ทำผ่าน Vercel Cron ตามเวลาในคิวเท่านั้น (ปิด manual publish แล้ว)" },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: "task ต้องเป็น 'stock'" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
