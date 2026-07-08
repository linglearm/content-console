/**
 * ตรวจสอบ env และตัดสินใจว่าแต่ละบริการควรใช้ของจริงหรือ mock
 * หลักการ: ค่าที่ยังเป็น placeholder (ขึ้นต้น YOUR_ หรือมี YOUR-PROJECT) ถือว่า "ยังไม่มี"
 */

function isPlaceholder(v: string | undefined | null): boolean {
  if (!v) return true;
  const s = v.trim();
  if (s === "") return true;
  return s.startsWith("YOUR_") || s.includes("YOUR-PROJECT") || s.includes("YOUR-");
}

export function hasReal(v: string | undefined | null): boolean {
  return !isPlaceholder(v);
}

const APP_MODE = (process.env.APP_MODE || "auto").toLowerCase();

/** บังคับ mock ทั้งระบบไหม */
export function forceMock(): boolean {
  return APP_MODE === "mock";
}
export function forceLive(): boolean {
  return APP_MODE === "live";
}

/** Supabase พร้อมใช้ของจริงหรือยัง (ฝั่ง server ใช้ service role) */
export function supabaseReady(): boolean {
  if (forceMock()) return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return hasReal(url) && hasReal(service);
}

/** Supabase ฝั่ง public (anon) — สำหรับหน้าเว็บสาธารณะอ่านบทความ published */
export function supabasePublicReady(): boolean {
  if (forceMock()) return false;
  return hasReal(process.env.NEXT_PUBLIC_SUPABASE_URL) && hasReal(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function claudeReady(): boolean {
  if (forceMock()) return false;
  return hasReal(process.env.ANTHROPIC_API_KEY);
}

export function geminiReady(): boolean {
  if (forceMock()) return false;
  return hasReal(process.env.GEMINI_API_KEY);
}

export function lineReady(): boolean {
  if (forceMock()) return false;
  return hasReal(process.env.LINE_CHANNEL_ACCESS_TOKEN) && hasReal(process.env.LINE_GROUP_ID);
}

export function facebookReady(): boolean {
  if (forceMock()) return false;
  return hasReal(process.env.FACEBOOK_PAGE_ID) && hasReal(process.env.FACEBOOK_PAGE_ACCESS_TOKEN);
}

/** ผู้ให้บริการเขียนบทความที่เลือกไว้ */
export function textProvider(): "claude" | "gemini" {
  return (process.env.TEXT_PROVIDER || "claude").toLowerCase() === "gemini" ? "gemini" : "claude";
}

/**
 * สวิตช์นิรภัย: อนุญาตให้ "ปล่อยจริง" (โพสต์เว็บ + Facebook) ไหม
 * ค่าเริ่มต้น = ปิด (false) — publishDue จะไม่ทำอะไรจนกว่าตั้ง PUBLISH_ENABLED=true
 * ใช้กันการโพสต์ลงเพจจริงโดยไม่ตั้งใจระหว่างพัฒนา/ทดสอบ
 */
export function publishEnabled(): boolean {
  return (process.env.PUBLISH_ENABLED || "").toLowerCase() === "true";
}

/** เวลาโพสต์ต่อวัน (Asia/Bangkok, รูปแบบ HH:MM) — จำนวน = โพสต์ต่อวัน */
export function postTimes(): string[] {
  return (process.env.POST_TIMES || "10:00,16:00,19:00,21:00")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** buffer: เตรียมโพสต์ล่วงหน้ากี่วัน (เป้า) */
export function bufferTargetDays(): number {
  return Math.max(1, Number(process.env.BUFFER_TARGET_DAYS || 5));
}

/** buffer: ถ้าคิวเหลือน้อยกว่ากี่วัน จึงเติมใหม่ */
export function bufferMinDays(): number {
  return Math.max(1, Number(process.env.BUFFER_MIN_DAYS || 3));
}

/** ธีม/แนวเนื้อหาของแบรนด์ (SiamAthlete: ฟิตเนส/เพาะกาย/วิทย์การออกกำลังกาย/โภชนาการ) */
export function contentTheme(): string {
  return (
    process.env.CONTENT_THEME ||
    "ฟิตเนส เพาะกาย วิทยาศาสตร์การออกกำลังกาย และโภชนาการสำหรับนักกีฬา (แบรนด์ SiamAthlete)"
  );
}

/** สรุปสถานะทุกบริการ (ใช้แสดงในหลังบ้านว่ายังขาด key อะไร) */
export function serviceStatus() {
  return {
    mode: APP_MODE,
    supabase: supabaseReady(),
    claude: claudeReady(),
    gemini: geminiReady(),
    line: lineReady(),
    facebook: facebookReady(),
    textProvider: textProvider(),
    publishEnabled: publishEnabled(),
  };
}
