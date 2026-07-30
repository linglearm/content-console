/**
 * IMAGES — หารูปปกฟรีให้บทความ (ใช้ได้ทั้งเชิงพาณิชย์ ไม่ต้องจ่าย ไม่ต้องขออนุญาต)
 *   1) Pexels    — PEXELS_API_KEY (ฟรี ไม่จำกัดจำนวนภาพ)
 *   2) Unsplash  — UNSPLASH_ACCESS_KEY (ฟรี 50 req/ชม. ใน demo mode)
 *   3) รูปสต็อกในโค้ด (stockImages.ts) — ไม่ต้องมีคีย์ ใช้เป็นตัวกันเหนียวเสมอ
 *
 * คืน URL ตรงจากผู้ให้บริการ (https, ถาวร) — LINE hero + FB /photos ใช้ URL ตรงได้
 * ไม่มีคีย์/หาไม่เจอ/เน็ตล้ม = ตกไปข้อ 3 เงียบ ๆ (ห้ามทำให้ flow เขียนบทความล้ม)
 */
import { pexelsReady, unsplashReady } from "./env";
import { stockImageUrl } from "./stockImages";

const TIMEOUT_MS = 6000;

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // timeout / เน็ตล้ม / JSON เพี้ยน → ให้ตัวเรียกไป provider ถัดไป
  }
}

/** คำค้นภาษาอังกฤษ — Pexels/Unsplash ค้นไทยไม่เจอ จึงต้องส่ง query อังกฤษมาจาก routine */
function pickQuery(query: string): string {
  const q = query.trim();
  return q || "gym weight training";
}

async function fromPexels(query: string): Promise<string | null> {
  if (!pexelsReady()) return null;
  const url =
    "https://api.pexels.com/v1/search?" +
    new URLSearchParams({ query: pickQuery(query), per_page: "1", orientation: "landscape" });
  const data = (await fetchJson(url, { Authorization: process.env.PEXELS_API_KEY as string })) as {
    photos?: { src?: { large2x?: string; large?: string } }[];
  } | null;
  const src = data?.photos?.[0]?.src;
  return src?.large2x || src?.large || null;
}

async function fromUnsplash(query: string): Promise<string | null> {
  if (!unsplashReady()) return null;
  const url =
    "https://api.unsplash.com/search/photos?" +
    new URLSearchParams({ query: pickQuery(query), per_page: "1", orientation: "landscape" });
  const data = (await fetchJson(url, {
    Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY as string}`,
  })) as { results?: { urls?: { regular?: string; full?: string } }[] } | null;
  const urls = data?.results?.[0]?.urls;
  return urls?.regular || urls?.full || null;
}

/**
 * หารูปปก: Pexels → Unsplash → รูปสต็อกในโค้ด
 * @param query คำค้นภาษาอังกฤษ (routine ส่งมาใน image_query)
 * @param topic หัวข้อบทความ (ใช้เลือกรูปสต็อกให้ตรงหมวดตอน fallback)
 * @param seed  ทำให้รูปสต็อกไม่ซ้ำกันทุกบทความ
 */
export async function findFreeImage(query: string, topic: string, seed = ""): Promise<string> {
  const found = (await fromPexels(query)) || (await fromUnsplash(query));
  return found || stockImageUrl(topic, seed);
}
