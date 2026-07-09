import { NextRequest, NextResponse } from "next/server";
import { deleteArticle, getArticle, updateArticle } from "@/lib/store";
import { isCanonicalSlot } from "@/lib/schedule";
import { postTimes } from "@/lib/env";
import type { Article } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await getArticle(id);
  if (!article) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ article });
}

/**
 * แก้ไข / อนุมัติ+ตั้งเวลา
 * body รองรับ: title, body, excerpt, image_url, status, scheduled_at
 * ถ้าส่ง scheduled_at มาและ status ยัง pending → เปลี่ยนเป็น scheduled ให้อัตโนมัติ
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await getArticle(id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: Partial<Article> = {};

  for (const key of ["title", "body", "excerpt", "image_url"] as const) {
    if (typeof body[key] === "string") patch[key] = body[key];
  }
  if (typeof body.scheduled_at === "string" || body.scheduled_at === null) {
    // 🔒 กันการ re-time ผิดปกติ — ถ้าตั้ง scheduled_at ต้องตรงช่องเวลามาตรฐาน (เวลาไทย 10/16/19/21)
    // ปฏิเสธค่าที่ผิดแพทเทิร์น (เช่น job/ตัวเก่าดันเวลาให้กระจุกทุก ~14 นาที) เพื่อไม่ให้คิวถูกทำลาย
    if (typeof body.scheduled_at === "string" && !isCanonicalSlot(body.scheduled_at, postTimes())) {
      return NextResponse.json(
        {
          error: `scheduled_at ต้องตรงช่องเวลามาตรฐาน (${postTimes().join(" ")} เวลาไทย) — ปฏิเสธค่าที่ผิดแพทเทิร์นเพื่อกันการ re-time`,
          rejectedScheduledAt: body.scheduled_at,
        },
        { status: 422 }
      );
    }
    patch.scheduled_at = body.scheduled_at;
  }
  if (typeof body.status === "string") {
    patch.status = body.status;
  }
  // อนุมัติ: มีเวลานัด แต่ยังไม่ได้ตั้ง status → ตั้งเป็น scheduled
  if (patch.scheduled_at && !patch.status && existing.status === "pending") {
    patch.status = "scheduled";
  }

  const updated = await updateArticle(id, patch);
  return NextResponse.json({ article: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteArticle(id);
  return NextResponse.json({ ok: true });
}
