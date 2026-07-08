import { NextRequest, NextResponse } from "next/server";
import { stockCheck } from "@/lib/content";
import { cronAuthorized } from "@/lib/cron";

export const dynamic = "force-dynamic";

async function run(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await stockCheck();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
