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

/**
 * เวลา "การ์ดรออนุมัติเข้ากลุ่ม LINE" ต่อวัน (Asia/Bangkok, รูปแบบ HH:MM) — จำนวน = การ์ดต่อวัน
 * ไม่ใช่เวลาโพสต์: โพสต์ขึ้นเพจตอนเจ้าของกด ✅ ในกลุ่ม (ดู releaseDue/approveArticle)
 */
export function postTimes(): string[] {
  return (process.env.POST_TIMES || "11:00,14:00,16:00,20:00")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * คลัง buffer: เก็บบทความรอไว้กี่ชิ้น (เป้า)
 * ดีฟอลต์ 12 = 3 วันพอดีที่ 4 โพสต์/วัน — ต้องไม่ต่ำกว่าเกณฑ์เตือน (bufferAlertDays)
 * ไม่งั้นคลังเต็มแล้วก็ยังโดนเตือนว่า "เหลือน้อยกว่า 3 วัน" ทุกวัน
 */
export function bufferTargetItems(): number {
  return Math.max(1, Number(process.env.BUFFER_TARGET_ITEMS || 12));
}

/** เตือนเจ้าของเมื่อคลังเหลือน้อยกว่ากี่วัน (เจ้าของจะได้เปิดคอมให้ routine เขียนเติม) */
export function bufferAlertDays(): number {
  return Math.max(1, Number(process.env.BUFFER_ALERT_DAYS || 3));
}

/** คลัง buffer: เหลือน้อยกว่ากี่ชิ้นจึงเติมใหม่ */
export function bufferMinItems(): number {
  return Math.max(1, Number(process.env.BUFFER_MIN_ITEMS || 4));
}

/** ความยาวบทความที่ยอมรับ (ตัวอักษร นับช่องว่าง) — ตีกลับถ้าไม่เข้าเกณฑ์ */
export function bodyLenRange(): { min: number; max: number } {
  return {
    min: Math.max(1, Number(process.env.BODY_MIN_CHARS || 1500)),
    max: Math.max(2, Number(process.env.BODY_MAX_CHARS || 2000)),
  };
}

/** คลังรูปฟรี — Pexels/Unsplash (ไม่มีคีย์ = ตกไปใช้รูปสต็อกในโค้ด) */
export function pexelsReady(): boolean {
  if (forceMock()) return false;
  return hasReal(process.env.PEXELS_API_KEY);
}
export function unsplashReady(): boolean {
  if (forceMock()) return false;
  return hasReal(process.env.UNSPLASH_ACCESS_KEY);
}

/** ลิงก์แอดเพื่อน LINE OA ของ SiamAthlete (ใช้โพสต์เป็นคอมเมนต์ที่ 2 ใต้โพสต์เพจ) */
export function lineOaUrl(): string {
  return (process.env.NEXT_PUBLIC_LINE_OA_URL || "https://line.me/R/ti/p/@494hxjay").trim();
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
    pexels: pexelsReady(),
    unsplash: unsplashReady(),
  };
}
