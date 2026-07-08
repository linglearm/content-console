/**
 * สร้างรูปด้วย Pollinations (ฟรี ไม่ต้องใช้ key)
 * โครงสร้าง URL: https://image.pollinations.ai/prompt/<prompt>?width=..&height=..
 * รูปถูกสร้างตอนเปิด URL — เราคืน URL ให้ใช้เป็น image_url ได้เลย
 */
const BASE = process.env.POLLINATIONS_BASE || "https://image.pollinations.ai/prompt";

export function pollinationsUrl(topic: string, seed?: number): string {
  // สไตล์รูปให้เข้าธีมฟิตเนส/เพาะกาย (SiamAthlete)
  const prompt = `${topic}, fitness and bodybuilding theme, gym, athletic, high quality blog cover photo, clean, modern`;
  const params = new URLSearchParams({
    width: "1024",
    height: "576",
    nologo: "true",
  });
  if (seed !== undefined) params.set("seed", String(seed));
  return `${BASE}/${encodeURIComponent(prompt)}?${params.toString()}`;
}

/**
 * (ทางเลือกในเฟส 2) ดาวน์โหลดรูปจริงเพื่ออัปโหลดเข้า Supabase Storage
 * ในเฟส 1 เราใช้ URL ตรงจาก Pollinations เป็น image_url ได้เลย
 */
export async function fetchImageBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pollinations fetch error ${res.status}`);
  return res.arrayBuffer();
}
