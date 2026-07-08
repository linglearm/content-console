import { NextRequest, NextResponse } from "next/server";
import { generateArticle } from "@/lib/content";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const topic = (body.topic || "").toString().trim();
    if (!topic) {
      return NextResponse.json({ error: "กรุณาระบุหัวข้อ (topic)" }, { status: 400 });
    }
    const article = await generateArticle(topic);
    return NextResponse.json({ article });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
