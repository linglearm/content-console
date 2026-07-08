import { NextRequest, NextResponse } from "next/server";
import { deleteArticle, getArticle, updateArticle } from "@/lib/store";
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
