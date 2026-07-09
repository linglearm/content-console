import { NextRequest, NextResponse } from "next/server";
import { deleteArticle, getArticle, updateArticle } from "@/lib/store";
import { cronAuthorized } from "@/lib/cron";
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
  // 🔒 เขียนได้เฉพาะที่มี x-cron-secret — ปิดช่องให้ตัวภายนอกยิงแก้/re-time บทความไม่ได้
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const existing = await getArticle(id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: Partial<Article> = {};

  for (const key of ["title", "body", "excerpt", "image_url"] as const) {
    if (typeof body[key] === "string") patch[key] = body[key];
  }
  if (typeof body.scheduled_at === "string" || body.scheduled_at === null) {
    // หมายเหตุ: การ re-time เพื่อ "โพสต์วันนี้" เป็นฟีเจอร์ที่เจ้าของสั่งได้ จึงไม่จำกัดค่าเวลา
    // (การเขียนยังต้องมี x-cron-secret อยู่ — กันคนภายนอกที่ไม่มีสิทธิ์)
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // 🔒 ลบได้เฉพาะที่มี x-cron-secret
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  await deleteArticle(id);
  return NextResponse.json({ ok: true });
}
