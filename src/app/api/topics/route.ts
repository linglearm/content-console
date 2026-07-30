import { NextRequest, NextResponse } from "next/server";
import { listAllTopics } from "@/lib/store";
import { cronAuthorized } from "@/lib/cron";

export const dynamic = "force-dynamic";

/**
 * หัวข้อที่ "เคยเขียนไปแล้ว" ทุกสถานะ (pending/scheduled/published/rejected) เรียงใหม่→เก่า
 * ให้ Claude routine เรียกก่อนเขียน เพื่อเลี่ยงหัวข้อซ้ำ
 * (ฝั่ง /api/ingest มีด่านกันซ้ำอีกชั้น — ซ้ำจะได้ 409 กลับไป)
 * ต้องมี header x-cron-secret
 */
async function run(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const topics = await listAllTopics();
  return NextResponse.json({ count: topics.length, topics });
}

export const GET = run;
export const POST = run;
