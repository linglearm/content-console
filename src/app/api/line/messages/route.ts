import { NextResponse } from "next/server";
import { listLineMessages } from "@/lib/store";

export const dynamic = "force-dynamic";

// แผงหลังบ้านเรียกดูข้อความที่ระบบส่งเข้ากลุ่ม LINE
export async function GET() {
  try {
    const messages = await listLineMessages();
    return NextResponse.json({ messages });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
