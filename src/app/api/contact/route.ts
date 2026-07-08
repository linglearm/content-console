import { NextRequest, NextResponse } from "next/server";
import { addContact } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = (body.name || "").toString().trim();
    const contact = (body.contact || "").toString().trim();
    const message = (body.message || "").toString().trim();
    if (!message) {
      return NextResponse.json({ error: "กรุณากรอกข้อความ" }, { status: 400 });
    }
    const saved = await addContact({ name, contact, message });
    return NextResponse.json({ ok: true, id: saved.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
