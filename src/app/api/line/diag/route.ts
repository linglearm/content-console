import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";

export const dynamic = "force-dynamic";

/**
 * ตรวจว่า "แอปตัวนี้" ใช้บอท LINE ตัวไหน และยิงเข้ากลุ่มไหนจริง ๆ
 * ถามจาก LINE API ตรง ๆ ด้วย env ที่ production ใช้อยู่ (ไม่ใช่ค่าในเครื่องซึ่งเก่า/ผิดได้)
 *   - /v2/bot/info                     → ชื่อบอท + basicId (@xxx)
 *   - /v2/bot/group/{id}/summary       → ชื่อกลุ่มที่ LINE_GROUP_ID ชี้ไป (404 = บอทไม่ได้อยู่ในกลุ่มนั้น)
 *   - /v2/bot/message/quota            → โควตาข้อความของ OA ตัวนี้
 * ไม่คืน token · คืน groupId เพื่อให้เจ้าของเอาไปแก้ .env.local ให้ตรงได้
 * auth: x-cron-secret / Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
  const groupId = process.env.LINE_GROUP_ID || "";
  const h = { Authorization: `Bearer ${token}` };

  async function ask(path: string) {
    try {
      const r = await fetch(`https://api.line.me${path}`, { headers: h });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    } catch (e) {
      return { status: 0, body: { error: (e as Error).message } };
    }
  }

  const info = await ask("/v2/bot/info");
  const group = groupId ? await ask(`/v2/bot/group/${groupId}/summary`) : { status: 0, body: { error: "no LINE_GROUP_ID" } };
  const quota = await ask("/v2/bot/message/quota");
  const used = await ask("/v2/bot/message/quota/consumption");

  return NextResponse.json({
    app: "content-console (SiamAthlete)",
    tokenConfigured: token.length > 20 && !token.startsWith("YOUR_"),
    bot: { status: info.status, displayName: (info.body as any)?.displayName ?? null, basicId: (info.body as any)?.basicId ?? null },
    group: { id: groupId || null, status: group.status, groupName: (group.body as any)?.groupName ?? null, error: (group.body as any)?.message ?? null },
    quota: { status: quota.status, ...(quota.body as object) },
    consumption: { status: used.status, ...(used.body as object) },
  });
}
