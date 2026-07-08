import { NextRequest, NextResponse } from "next/server";
import { listArticles } from "@/lib/store";
import type { ArticleStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get("status") as ArticleStatus | null;
    const articles = await listArticles(status ? { status } : undefined);
    return NextResponse.json({ articles });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
