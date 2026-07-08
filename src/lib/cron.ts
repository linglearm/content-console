import { NextRequest } from "next/server";
import { hasReal } from "./env";

/**
 * ตรวจสิทธิ์เรียก endpoint cron (publish-due, stock-check)
 * GitHub Actions ส่ง header: x-cron-secret: <CRON_SECRET>
 * ถ้ายังไม่ตั้ง CRON_SECRET จริง (dev/placeholder) → อนุญาต เพื่อความสะดวกตอนทดสอบ
 */
export function cronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!hasReal(secret) || secret === "dev-cron-secret") return true; // โหมดทดสอบ
  const header = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret;
}
