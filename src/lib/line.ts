/**
 * LINE Messaging API — ส่งข้อความเข้ากลุ่ม + ตรวจ signature ของ webhook
 */
import crypto from "crypto";
import { hasReal, lineReady } from "./env";

const PUSH_URL = "https://api.line.me/v2/bot/message/push";
const REPLY_URL = "https://api.line.me/v2/bot/message/reply";

/** มี channel access token จริงไหม (ใช้ตัดสินใจ reply — ไม่ต้องมี group id) */
export function lineTokenReady(): boolean {
  return hasReal(process.env.LINE_CHANNEL_ACCESS_TOKEN);
}

/**
 * ตอบกลับข้อความด้วย reply token (ใช้ตอนบอทตอบคำสั่งในกลุ่ม เช่น groupid/อนุมัติ)
 * ต้องมีแค่ channel access token — ไม่ต้องมี group id
 */
export async function replyMessage(replyToken: string, text: string): Promise<boolean> {
  if (!lineTokenReady()) return false;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
  const res = await fetch(REPLY_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`LINE reply error ${res.status}: ${detail}`);
  }
  return true;
}

/**
 * ส่งข้อความเข้ากลุ่ม LINE
 * คืนค่า true ถ้าส่งจริงสำเร็จ, false ถ้าอยู่ mock mode (ยังไม่มี key)
 */
export async function pushToGroup(text: string): Promise<boolean> {
  if (!lineReady()) {
    // mock: ไม่ยิงจริง — ผู้เรียกจะบันทึกลง outbox เองเพื่อแสดงในหลังบ้าน
    return false;
  }
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
  const to = process.env.LINE_GROUP_ID!;

  const res = await fetch(PUSH_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`LINE push error ${res.status}: ${detail}`);
  }
  return true;
}

/** ส่งการ์ด Flex เข้ากลุ่ม (ดราฟต์ที่มีปุ่ม) — คืน false ถ้า mock */
export async function pushFlexToGroup(altText: string, contents: unknown): Promise<boolean> {
  if (!lineReady()) return false;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
  const to = process.env.LINE_GROUP_ID!;
  const res = await fetch(PUSH_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages: [{ type: "flex", altText, contents }] }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`LINE flex push error ${res.status}: ${detail}`);
  }
  return true;
}

/** ตรวจ x-line-signature ของ webhook (HMAC-SHA256 ด้วย channel secret) */
export function verifyLineSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const hash = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
}
