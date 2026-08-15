/**
 * ตรวจสอบ env และตัดสินใจว่าแต่ละบริการควรใช้ของจริงหรือ mock
 * หลักการ: ค่าที่ยังเป็น placeholder (ขึ้นต้น YOUR_ หรือมี YOUR-PROJECT) ถือว่า "ยังไม่มี"
 *
 * ❗ 2026-08-15 — สายผลิตบทความ SiamAthlete ถูกถอดออกทั้งชุดตามคำสั่งเจ้าของ
 *    ตัวตรวจของ Claude/Gemini/LINE/Pexels/Unsplash และสวิตช์ PUBLISH_ENABLED
 *    ถูกลบไปพร้อมกัน เพราะไม่มีใครเรียกแล้ว · เหลือเฉพาะที่เส้น Human of Fit
 *    และหน้าเว็บอ่านบทความเก่ายังใช้อยู่จริง
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

/**
 * เพจ Facebook พร้อมใช้ของจริงหรือยัง — ตอนนี้เหลือผู้ใช้รายเดียวคือเส้น Human of Fit
 * (`/api/human-of-fit/facebook` → verifyPagePost/commentOnPostDetailed)
 * ❗ `FACEBOOK_PAGE_ID` + `FACEBOOK_PAGE_ACCESS_TOKEN` ต้องเป็นของ **เพจ Human of Fit**
 *    เพจอื่นจะทำให้ verifyPagePost ตีตกทุกใบด้วย facebook_post_page_mismatch
 */
export function facebookReady(): boolean {
  if (forceMock()) return false;
  return hasReal(process.env.FACEBOOK_PAGE_ID) && hasReal(process.env.FACEBOOK_PAGE_ACCESS_TOKEN);
}
