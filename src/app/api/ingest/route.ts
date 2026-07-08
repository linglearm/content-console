import { NextRequest, NextResponse } from "next/server";
import { ingestArticle } from "@/lib/content";
import { cronAuthorized } from "@/lib/cron";

export const dynamic = "force-dynamic";

/**
 * รับบทความสำเร็จรูปจาก Claude scheduled routine (ทางเลือก B)
 * body: { topic, title, body, excerpt?, image_url? }
 * ต้องมี header x-cron-secret ตรงกับ CRON_SECRET (routine เป็นคนส่ง)
 */
export async function POST(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const b = await req.json().catch(() => ({}));
    const topic = (b.topic || "").toString().trim();
    const title = (b.title || "").toString().trim();
    const body = (b.body || "").toString().trim();
    if (!topic || !title || !body) {
      return NextResponse.json({ error: "ต้องมี topic, title, body" }, { status: 400 });
    }
    const article = await ingestArticle({
      topic,
      title,
      body,
      excerpt: b.excerpt,
      image_url: b.image_url,
      scheduled_at: b.scheduled_at,
    });
    return NextResponse.json({ article });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
