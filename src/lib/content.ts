/**
 * CONTENT — orchestration ของ 3 ฟังก์ชันหลัก
 *   generateArticle : เขียนบทความ + ทำรูป → บันทึก pending + ส่งดราฟต์เข้า LINE
 *   publishDue      : ดึง scheduled ที่ถึงเวลา → โพสต์เว็บ+FB → published + ยืนยันเข้า LINE
 *   stockCheck      : นับที่รอปล่อย ถ้าต่ำกว่าเกณฑ์ → แจ้งเตือน LINE
 */
import {
  bufferMinDays,
  bufferTargetDays,
  claudeReady,
  contentTheme,
  geminiReady,
  postTimes,
  publishEnabled,
  textProvider,
} from "./env";
import { computePlan, firstOpenSlot, type BufferPlan } from "./schedule";
import { generateWithClaude } from "./claude";
import { generateWithGemini } from "./gemini";
import { pollinationsUrl } from "./pollinations";
import { stockImageUrl } from "./stockImages";
import { postToPage, fbPostUrl } from "./facebook";
import { pushToGroup, pushFlexToGroup } from "./line";
import { buildDraftFlex, buildPublishedFlex } from "./flex";
import {
  addLineMessage,
  countScheduled,
  createArticle,
  getSettings,
  listArticles,
  listDue,
  updateArticle,
} from "./store";
import type { Article } from "./types";

export interface GeneratedArticle {
  title: string;
  body: string;
  excerpt: string;
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * รูปปกบทความ — ค่าเริ่มต้นใช้รูปสต็อกฟรีจาก Unsplash (ภาพถ่ายจริง)
 * ตั้ง IMAGE_SOURCE=pollinations เพื่อกลับไปใช้รูป AI แทน
 */
function coverImage(topic: string, seed = ""): string {
  const src = (process.env.IMAGE_SOURCE || "stock").toLowerCase();
  if (src === "pollinations") return pollinationsUrl(topic);
  return stockImageUrl(topic, seed);
}

/** ตัด excerpt จาก body ถ้า provider ไม่ส่งมา */
function deriveExcerpt(body: string): string {
  const plain = body.replace(/[#*_>-]/g, "").replace(/\n+/g, " ").trim();
  return plain.slice(0, 140) + (plain.length > 140 ? "…" : "");
}

/** เขียนข้อความ (เลือก provider หรือ mock) */
async function writeText(topic: string): Promise<GeneratedArticle> {
  const theme = contentTheme();
  const provider = textProvider();
  if (provider === "gemini" && geminiReady()) return generateWithGemini(topic, theme);
  if (provider === "claude" && claudeReady()) return generateWithClaude(topic, theme);
  // เผื่อสลับ provider ผิดกับ key ที่มี — ลองอีกตัวก่อน mock
  if (claudeReady()) return generateWithClaude(topic, theme);
  if (geminiReady()) return generateWithGemini(topic, theme);

  // MOCK: ไม่มี key → คืนเนื้อหาตัวอย่างแนวฟิตเนส/เพาะกาย
  const title = `${topic}: คู่มือฉบับเข้าใจง่ายสำหรับนักฝึก`;
  const body =
    `# ${title}\n\n(เนื้อหา MOCK — ยังไม่ได้ใส่ ANTHROPIC_API_KEY · ธีม: ${theme})\n\n` +
    `## ทำไมเรื่องนี้สำคัญต่อการฝึก\nเนื้อหาตัวอย่างสำหรับหัวข้อ "${topic}"\n\n` +
    `## 3 หลักการที่ควรรู้\n- โปรแกรมฝึก (training)\n- โภชนาการ (nutrition)\n- การพักฟื้น (recovery)\n\n` +
    `## สรุป\nนี่คือบทความทดสอบระบบ พอใส่ key จริงแล้ว AI จะเขียนเนื้อหาแนว ${theme} จริงแทน`;
  return { title, body, excerpt: `บทความ (mock) แนวฟิตเนส/เพาะกาย เกี่ยวกับ ${topic} สำหรับทดสอบระบบ` };
}

// ---------------------------------------------------------------------------

/** บันทึกดราฟต์ (ใช้ร่วมกันระหว่าง generate ในแอป และ ingest จาก Claude routine) */
async function saveDraft(input: {
  topic: string;
  title: string;
  body: string;
  excerpt: string;
  image_url: string;
}): Promise<Article> {
  const article = await createArticle({
    topic: input.topic,
    title: input.title,
    body: input.body,
    excerpt: input.excerpt,
    image_url: input.image_url,
    status: "pending",
  });

  // ส่งการ์ด Flex (มีปุ่ม ✅อนุมัติ / ✏️แก้ไข / 🚫ไม่อนุมัติ) เข้ากลุ่ม LINE
  const flex = buildDraftFlex(article, siteUrl());
  const sentLive = await pushFlexToGroup(flex.altText, flex.contents);
  const outboxText = `📝 ดราฟต์รออนุมัติ\nหัวเรื่อง: ${article.title}\nคำโปรย: ${input.excerpt}`;
  await addLineMessage("draft", (sentLive ? "" : "[mock] ") + outboxText, article.id);

  return article;
}

/**
 * สร้างบทความในแอป (ให้ AI ในแอปเขียน — ใช้เมื่อมี ANTHROPIC_API_KEY, ไม่งั้น mock)
 * ทางเลือก B: ปกติจะให้ Claude routine เขียนแล้วส่งเข้ามาทาง ingestArticle แทน
 */
export async function generateArticle(topic: string): Promise<Article> {
  const gen = await writeText(topic);
  return saveDraft({
    topic,
    title: gen.title,
    body: gen.body,
    excerpt: gen.excerpt || deriveExcerpt(gen.body),
    image_url: coverImage(topic, gen.title),
  });
}

/**
 * รับบทความ "สำเร็จรูป" จาก Claude routine → เข้าคิวปล่อยอัตโนมัติ (ไม่ผ่าน approve)
 * ตั้งสถานะ scheduled + scheduled_at ทันที (ใช้ slot ที่ routine ส่งมา หรือหาช่องว่างถัดไป)
 * ไม่ส่งการ์ดเข้า LINE ตอนนี้ — จะแจ้งเฉพาะตอน "ขึ้นเพจแล้ว" (publishDue)
 */
export async function ingestArticle(input: {
  topic: string;
  title: string;
  body: string;
  excerpt?: string;
  image_url?: string;
  scheduled_at?: string; // slot ที่ routine กำหนด (UTC ISO); ไม่ส่งมา = หาช่องว่างถัดไปเอง
}): Promise<Article> {
  const excerpt = (input.excerpt || "").trim() || deriveExcerpt(input.body);
  const image_url = (input.image_url || "").trim() || coverImage(input.topic, input.title);

  // กำหนดเวลาปล่อย: ใช้ค่าที่ส่งมา หรือหาช่องว่างถัดไปในคิว
  let scheduled_at = (input.scheduled_at || "").toString().trim();
  if (!scheduled_at) {
    const scheduled = await listArticles({ status: "scheduled" });
    scheduled_at = firstOpenSlot(scheduled, new Date(), postTimes(), bufferTargetDays() + 3);
  } else {
    scheduled_at = new Date(scheduled_at).toISOString(); // normalize
  }

  const article = await createArticle({
    topic: input.topic,
    title: input.title,
    body: input.body,
    excerpt,
    image_url,
    status: "scheduled",
  });
  const updated = await updateArticle(article.id, { scheduled_at });
  return updated || { ...article, scheduled_at };
}

/** สถานะคิว buffer (ให้ routine เช็กว่าต้องเติมไหม) */
export async function getBufferPlan(): Promise<BufferPlan> {
  const scheduled = await listArticles({ status: "scheduled" });
  return computePlan(scheduled, new Date(), postTimes(), bufferTargetDays(), bufferMinDays());
}

/** ปล่อยบทความที่ถึงเวลา (โพสต์เว็บ + FB) */
export async function publishDue(nowISO?: string): Promise<Article[]> {
  // 🔒 สวิตช์นิรภัย — ถ้ายังไม่เปิด PUBLISH_ENABLED จะไม่ปล่อยจริง (กันโพสต์ลงเพจโดยไม่ตั้งใจ)
  if (!publishEnabled()) {
    return [];
  }
  const now = nowISO || new Date().toISOString();
  const due = await listDue(now);
  const published: Article[] = [];

  for (const a of due) {
    const link = `${siteUrl()}/article/${a.id}`;

    // โพสต์เนื้อหาเต็มลง Facebook Fanpage (รูป + แคปชั่นเต็ม; mock จะคืน postId ปลอม)
    const fb = await postToPage(a.body, { imageUrl: a.image_url || undefined, link });

    const updated = await updateArticle(a.id, {
      status: "published",
      published_at: now,
      fb_post_id: fb.postId,
    });
    if (updated) published.push(updated);

    // ยืนยันเข้ากลุ่ม LINE — การ์ด Flex มีปุ่ม 📘 เปิดโพสต์บนเพจ + 🌐 อ่านบนเว็บ
    const postUrl = fbPostUrl(fb.postId);
    const card = buildPublishedFlex(a, link, postUrl);
    const sentLive = await pushFlexToGroup(card.altText, card.contents);
    const outboxText =
      `✅ โพสต์ลงเพจแล้ว: ${a.title}\n` +
      `เว็บ: ${link}\n` +
      (fb.posted
        ? `เพจ FB: ${postUrl || `โพสต์แล้ว (id: ${fb.postId})`}`
        : `เพจ FB: [mock] จำลองโพสต์ (id: ${fb.postId})`);
    await addLineMessage("publish_confirm", (sentLive ? "" : "[mock] ") + outboxText, a.id);
  }

  return published;
}

/** เช็กสต็อก — ต่ำกว่าเกณฑ์แจ้งเตือน LINE */
export async function stockCheck(): Promise<{
  count: number;
  target: number;
  threshold: number;
  alerted: boolean;
}> {
  const settings = await getSettings();
  const count = await countScheduled();
  let alerted = false;

  if (count < settings.stock_threshold) {
    const text =
      `⚠️ สต็อกบทความใกล้หมด!\n` +
      `รอปล่อย (scheduled): ${count} ชิ้น (เป้า ${settings.stock_target}, เกณฑ์เตือน < ${settings.stock_threshold})\n` +
      `แนะนำให้สร้างบทความเพิ่มที่: ${siteUrl()}/admin`;
    const sentLive = await pushToGroup(text);
    await addLineMessage("stock_alert", (sentLive ? "" : "[mock] ") + text);
    alerted = true;
  }

  return { count, target: settings.stock_target, threshold: settings.stock_threshold, alerted };
}
