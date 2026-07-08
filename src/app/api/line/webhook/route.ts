import { NextRequest, NextResponse } from "next/server";
import { verifyLineSignature, replyMessage } from "@/lib/line";
import { hasReal } from "@/lib/env";
import { addLineMessage, getArticle, updateArticle } from "@/lib/store";

export const dynamic = "force-dynamic";

/** GET: ให้ LINE ตรวจ endpoint ได้ (Verify) */
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "line-webhook" });
}

/**
 * POST: รับ event จาก LINE
 * รองรับคำสั่งข้อความในกลุ่มแบบง่ายในเฟส 1:
 *   - "groupid"                     → บอทตอบ group id (ช่วยตอนตั้งค่า LINE_GROUP_ID)
 *   - "อนุมัติ <id> <ISO datetime>"  → ตั้งบทความเป็น scheduled ตามเวลา
 *   - "ลบ <id>"                      → ตั้งสถานะกลับ pending (ตัวอย่างการแก้ไขผ่าน LINE)
 * (การอนุมัติหลักทำผ่านหลังบ้านได้เช่นกัน)
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();

  // ตรวจ signature เฉพาะเมื่อมี channel secret จริง
  if (hasReal(process.env.LINE_CHANNEL_SECRET)) {
    const sig = req.headers.get("x-line-signature");
    if (!verifyLineSignature(raw, sig)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  let payload: { events?: LineEvent[] } = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  for (const ev of payload.events || []) {
    // --- ปุ่มบนการ์ด Flex (postback / datetimepicker) ---
    if (ev.type === "postback") {
      const data = new URLSearchParams(ev.postback?.data || "");
      const action = data.get("action");
      const id = data.get("id");
      if (!id) continue;
      const article = await getArticle(id);
      if (!article) {
        if (ev.replyToken) await replyMessage(ev.replyToken, "ไม่พบบทความนี้แล้ว (อาจถูกลบไปแล้ว)");
        continue;
      }

      if (action === "approve") {
        // datetimepicker ส่งเวลาที่เลือกมาใน params.datetime ("YYYY-MM-DDTHH:mm" = เวลาไทย)
        const dt = ev.postback?.params?.datetime;
        const when = dt ? new Date(`${dt}:00+07:00`) : null;
        if (when && !isNaN(when.getTime())) {
          await updateArticle(id, { status: "scheduled", scheduled_at: when.toISOString() });
          const reply =
            `✅ อนุมัติแล้ว: ${article.title}\n` +
            `จะปล่อย: ${when.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} น.`;
          if (ev.replyToken) await replyMessage(ev.replyToken, reply);
          await addLineMessage("publish_confirm", reply, id);
        }
      } else if (action === "reject") {
        await updateArticle(id, { status: "rejected" });
        const reply =
          `🚫 ไม่อนุมัติแล้ว: ${article.title}\n` +
          `(ระบบจะสร้างบทความใหม่มาแทนในรอบถัดไป)`;
        if (ev.replyToken) await replyMessage(ev.replyToken, reply);
        await addLineMessage("draft", reply, id);
      }
      continue;
    }

    // --- คำสั่งข้อความในกลุ่ม (groupid / อนุมัติแบบพิมพ์) ---
    if (ev.type === "message" && ev.message?.type === "text") {
      const text = (ev.message.text || "").trim();
      const groupId = ev.source?.groupId;

      if (/^groupid$/i.test(text)) {
        const reply = `group id ของกลุ่มนี้คือ:\n${groupId || "(ไม่ใช่กลุ่ม)"}\nนำไปใส่ LINE_GROUP_ID ใน Vercel`;
        if (ev.replyToken) await replyMessage(ev.replyToken, reply);
        await addLineMessage("draft", reply);
        continue;
      }

      // "อนุมัติ <id> <ISO>" (สำรอง สำหรับพิมพ์เอง)
      const approve = text.match(/^(?:อนุมัติ|approve)\s+(\S+)\s+(.+)$/i);
      if (approve) {
        const [, id, whenRaw] = approve;
        const when = new Date(whenRaw);
        const article = await getArticle(id);
        if (article && !isNaN(when.getTime())) {
          await updateArticle(id, { status: "scheduled", scheduled_at: when.toISOString() });
          const reply = `✅ อนุมัติ+ตั้งเวลาแล้ว: ${article.title}\nจะปล่อย: ${when.toISOString()}`;
          if (ev.replyToken) await replyMessage(ev.replyToken, reply);
          await addLineMessage("publish_confirm", reply, id);
        }
        continue;
      }
    }
  }

  return NextResponse.json({ ok: true });
}

interface LineEvent {
  type: string;
  replyToken?: string;
  message?: { type: string; text?: string };
  postback?: { data?: string; params?: { datetime?: string } };
  source?: { groupId?: string; userId?: string };
}
