/**
 * CONTENT — orchestration ของ 3 ฟังก์ชันหลัก
 *   generateArticle : เขียนบทความ + ทำรูป → บันทึก pending + ส่งดราฟต์เข้า LINE
 *   publishDue      : ดึง scheduled ที่ถึงเวลา → โพสต์เว็บ+FB → published + ยืนยันเข้า LINE
 *   stockCheck      : นับที่รอปล่อย ถ้าต่ำกว่าเกณฑ์ → แจ้งเตือน LINE
 */
import { claudeReady, contentTheme, geminiReady, textProvider } from "./env";
import { generateWithClaude } from "./claude";
import { generateWithGemini } from "./gemini";
import { pollinationsUrl } from "./pollinations";
import { postToPage } from "./facebook";
import { pushToGroup, pushFlexToGroup } from "./line";
import { buildDraftFlex } from "./flex";
import {
  addLineMessage,
  countScheduled,
  createArticle,
  getSettings,
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
    image_url: pollinationsUrl(topic),
  });
}

/**
 * รับบทความ "สำเร็จรูป" จากภายนอก (Claude scheduled routine เขียนมาให้)
 * → บันทึก pending + ส่งดราฟต์เข้า LINE — ไม่เรียก AI ในแอป (ไม่มีค่า API)
 */
export async function ingestArticle(input: {
  topic: string;
  title: string;
  body: string;
  excerpt?: string;
  image_url?: string;
}): Promise<Article> {
  const excerpt = (input.excerpt || "").trim() || deriveExcerpt(input.body);
  const image_url = (input.image_url || "").trim() || pollinationsUrl(input.topic);
  return saveDraft({
    topic: input.topic,
    title: input.title,
    body: input.body,
    excerpt,
    image_url,
  });
}

/** ปล่อยบทความที่ถึงเวลา (โพสต์เว็บ + FB) */
export async function publishDue(nowISO?: string): Promise<Article[]> {
  const now = nowISO || new Date().toISOString();
  const due = await listDue(now);
  const published: Article[] = [];

  for (const a of due) {
    const link = `${siteUrl()}/article/${a.id}`;
    const message = `${a.title}\n\n${a.excerpt}\n\nอ่านต่อ: ${link}`;

    // โพสต์ลง Facebook Fanpage (mock จะคืน postId ปลอม)
    const fb = await postToPage(message, link);

    const updated = await updateArticle(a.id, {
      status: "published",
      published_at: now,
      fb_post_id: fb.postId,
    });
    if (updated) published.push(updated);

    // ยืนยันเข้ากลุ่ม LINE
    const confirm =
      `✅ เผยแพร่แล้ว: ${a.title}\n` +
      `เว็บ: ${link}\n` +
      `FB: ${fb.posted ? "โพสต์แล้ว" : "[mock] จำลองโพสต์"} (id: ${fb.postId})`;
    const sentLive = await pushToGroup(confirm);
    await addLineMessage("publish_confirm", (sentLive ? "" : "[mock] ") + confirm, a.id);
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
