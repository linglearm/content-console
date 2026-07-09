import { NextRequest, NextResponse } from "next/server";
import { ingestArticle, SlotTakenError } from "@/lib/content";
import { cronAuthorized } from "@/lib/cron";

export const dynamic = "force-dynamic";

/**
 * รับบทความสำเร็จรูปจาก Claude scheduled routine (ทางเลือก B)
 * body: { topic, title, body, excerpt?, image_url?, refs?, scheduled_at? }
 *   refs = แหล่งอ้างอิง (string หลายบรรทัด หรือ array ของลิงก์) → โพสต์เป็นคอมเมนต์ใต้โพสต์ FB
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
    // refs: รับได้ทั้ง array ของลิงก์ หรือ string หลายบรรทัด → normalize เป็น string เดียว
    const refs = Array.isArray(b.refs)
      ? b.refs.map((r: unknown) => (r || "").toString().trim()).filter(Boolean).join("\n")
      : (b.refs || "").toString().trim();
    const article = await ingestArticle({
      topic,
      title,
      body,
      excerpt: b.excerpt,
      image_url: b.image_url,
      refs,
      scheduled_at: b.scheduled_at,
    });
    return NextResponse.json({ article });
  } catch (e) {
    // ช่องเวลาถูกจองแล้ว → 409 (ตัวปั่นควรข้าม slot นี้ ไม่ใช่ error ระบบ)
    if (e instanceof SlotTakenError) {
      return NextResponse.json({ error: e.message, slotTaken: true }, { status: 409 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
