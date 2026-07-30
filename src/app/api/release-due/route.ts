import { NextRequest, NextResponse } from "next/server";
import { releaseDue } from "@/lib/content";
import { cronAuthorized } from "@/lib/cron";

export const dynamic = "force-dynamic";

/**
 * Vercel Cron — ถึงเวลาการ์ด (POST_TIMES = 11/14/16/20 เวลาไทย) ให้หยิบบทความในคลัง
 * ยิงการ์ด "รออนุมัติ" เข้ากลุ่ม LINE · ยังไม่โพสต์ลงเพจ (โพสต์ตอนเจ้าของกด ✅)
 * cron วิ่งทุก 10 นาที → บทความที่จองเวลาไว้จะออกภายใน 10 นาทีหลังเวลานั้น
 * ต้องมี header x-cron-secret (Vercel ส่ง Authorization: Bearer ให้เอง)
 */
async function run(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const { released, failed } = await releaseDue();
    return NextResponse.json({
      releasedCount: released.length,
      failed,
      released: released.map((a) => ({ id: a.id, title: a.title, scheduled_at: a.scheduled_at })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
