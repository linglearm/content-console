import { NextRequest, NextResponse } from "next/server";
import { findFreeImage } from "@/lib/images";
import { cronAuthorized } from "@/lib/cron";

export const dynamic = "force-dynamic";

/**
 * หารูปฟรีใหม่ให้บทความ (ใช้จากปุ่ม "หารูปใหม่" ในหน้าแอดมิน ก่อนกดอนุมัติ)
 * GET /api/image-search?q=<คำค้นอังกฤษ>&topic=<หัวข้อ>&seed=<กันรูปซ้ำ>
 * คืน { url } — ไม่มีคีย์ Pexels/Unsplash จะได้รูปสต็อกในโค้ดแทน
 * ต้องมี header x-cron-secret (เท่ากับด่านเขียนอื่น ๆ ของหลังบ้าน)
 */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const p = new URL(req.url).searchParams;
  const q = (p.get("q") || "").trim();
  const topic = (p.get("topic") || "").trim();
  const seed = (p.get("seed") || "").trim() || Math.random().toString(36).slice(2, 8);
  const url = await findFreeImage(q || topic, topic || q, seed);
  return NextResponse.json({ url });
}
