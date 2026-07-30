/**
 * CONTENT — orchestration ของวงจรบทความ (ทุกโพสต์ต้องผ่านการอนุมัติในกลุ่ม LINE)
 *
 *   ingestArticle  : รับบทความจาก Claude routine → ตรวจความยาว/กันหัวข้อซ้ำ → เข้าคลัง (pending)
 *                    พร้อมจอง "เวลาที่การ์ดจะเข้ากลุ่ม" (scheduled_at)
 *   releaseDue     : ถึงเวลา 11/14/16/20 → pending → scheduled + ยิงการ์ดรออนุมัติเข้ากลุ่ม LINE
 *   approveArticle : เจ้าของกด ✅ → โพสต์ลงเพจ FB + คอมเมนต์ + ขึ้นเว็บ → published
 *   rejectArticle  : เจ้าของกด 🚫 → rejected (คลังชิ้นถัดไปมาตามคิวเวลาปกติ)
 *   stockCheck     : คลังเหลือน้อยกว่าเกณฑ์ → เตือนเข้ากลุ่ม LINE
 */
import {
  bodyLenRange,
  bufferAlertDays,
  bufferMinItems,
  bufferTargetItems,
  claudeReady,
  contentTheme,
  geminiReady,
  lineReady,
  postTimes,
  publishEnabled,
  textProvider,
} from "./env";
import { computePlan, firstOpenSlot, type BufferPlan } from "./schedule";
import { generateWithClaude } from "./claude";
import { generateWithGemini } from "./gemini";
import { pollinationsUrl } from "./pollinations";
import { stockImageUrl } from "./stockImages";
import { findFreeImage } from "./images";
import { postToPage, fbPostUrl, commentOnPost, type FbPostResult } from "./facebook";
import { pushToGroup, pushFlexToGroup } from "./line";
import { buildDraftFlex } from "./flex";
import {
  addLineMessage,
  claimForPublish,
  claimForRelease,
  countPending,
  createArticle,
  getArticle,
  listAllTopics,
  listPendingDue,
  listQueued,
  updateArticle,
} from "./store";
import type { Article } from "./types";

export interface GeneratedArticle {
  title: string;
  body: string;
  excerpt: string;
}

/** ช่องเวลานี้ถูกจองแล้ว — โยนเพื่อกันบทความซ้อน slot เดียวกัน (double-post) */
export class SlotTakenError extends Error {
  constructor(public slot: string) {
    super(`ช่องเวลา ${slot} ถูกจองแล้ว (กันโพสต์ซ้อน)`);
    this.name = "SlotTakenError";
  }
}

/** ความยาวบทความไม่เข้าเกณฑ์ (นับตัวอักษรรวมช่องว่าง) */
export class BodyLengthError extends Error {
  constructor(public len: number, public min: number, public max: number) {
    super(`ความยาว ${len} ตัวอักษร ไม่เข้าเกณฑ์ ${min}-${max} (นับช่องว่าง)`);
    this.name = "BodyLengthError";
  }
}

/** หัวข้อนี้เคยเขียนไปแล้ว — กันคอนเทนต์ซ้ำบนเพจ */
export class DuplicateTopicError extends Error {
  constructor(public existing: string) {
    super(`หัวข้อนี้เคยเขียนไปแล้ว: ${existing}`);
    this.name = "DuplicateTopicError";
  }
}

/** ตัดคำช่วย/อักขระ เพื่อเทียบหัวข้อซ้ำแบบหยาบ ๆ (กันแค่ตั้งชื่อต่างกันเล็กน้อย) */
function normalizeTopic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** ซ้ำกับที่เคยเขียนไหม — เทียบทั้ง topic และ title กับทุกสถานะ (รวม published/rejected) */
async function findDuplicate(topic: string, title: string): Promise<string | null> {
  const wanted = [normalizeTopic(topic), normalizeTopic(title)].filter(Boolean);
  const rows = await listAllTopics();
  for (const r of rows) {
    const cand = [normalizeTopic(r.topic), normalizeTopic(r.title)];
    for (const w of wanted) {
      if (!w) continue;
      // ตรงกันเป๊ะ หรือชื่อหนึ่งกินอีกชื่อทั้งก้อน (เช่นเติมคำท้าย) = ถือว่าซ้ำ
      if (cand.some((c) => c && (c === w || (w.length > 12 && (c.includes(w) || w.includes(c)))))) {
        return `${r.title} (${r.status})`;
      }
    }
  }
  return null;
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

/**
 * หัวใจกลาง — เพิ่มบทความ "เข้าคลัง buffer" (ทุกทางเพิ่มโพสต์ต้องผ่านที่นี่)
 * ตั้ง status=pending + scheduled_at = เวลาที่การ์ดรออนุมัติจะเข้ากลุ่ม LINE
 * (ไม่ใช่เวลาโพสต์ — โพสต์เกิดตอนเจ้าของกด ✅ ใน approveArticle)
 */
async function bufferArticle(input: {
  topic: string;
  title: string;
  body: string;
  excerpt: string;
  image_url: string;
  refs?: string | null;
  scheduled_at?: string;
}): Promise<Article> {
  const queued = await listQueued();
  let scheduled_at = (input.scheduled_at || "").toString().trim();
  if (!scheduled_at) {
    scheduled_at = firstOpenSlot(queued, new Date(), postTimes(), bufferTargetItems() + 3);
  } else {
    scheduled_at = new Date(scheduled_at).toISOString(); // normalize
  }
  // 🔒 กันการ์ดซ้อน — ถ้ามีบทความจองช่องเวลานี้ไว้แล้ว (นาทีเดียวกัน) ไม่รับซ้ำ
  const slotMin = Math.floor(new Date(scheduled_at).getTime() / 60000);
  const taken = queued.some(
    (x) => x.scheduled_at && Math.floor(new Date(x.scheduled_at).getTime() / 60000) === slotMin
  );
  if (taken) {
    throw new SlotTakenError(scheduled_at);
  }
  const article = await createArticle({
    topic: input.topic,
    title: input.title,
    body: input.body,
    excerpt: input.excerpt,
    image_url: input.image_url,
    refs: input.refs ?? null,
    status: "pending",
  });
  const updated = await updateArticle(article.id, { scheduled_at });
  return updated || { ...article, scheduled_at };
}

/**
 * สร้างบทความในแอป (ให้ AI ในแอปเขียน — ใช้เมื่อมี ANTHROPIC_API_KEY, ไม่งั้น mock)
 * → เข้าคิว schedule เหมือนกัน (ไม่โพสต์ทันที ไม่มีดราฟต์รอ approve)
 */
export async function generateArticle(topic: string): Promise<Article> {
  const gen = await writeText(topic);
  return bufferArticle({
    topic,
    title: gen.title,
    body: gen.body,
    excerpt: gen.excerpt || deriveExcerpt(gen.body),
    image_url: coverImage(topic, gen.title),
  });
}

/**
 * รับบทความ "สำเร็จรูป" จาก Claude routine → เข้าคลัง buffer รอส่งการ์ดอนุมัติตามเวลา
 * ด่านตรวจก่อนรับเข้าคลัง (ตีกลับเป็น error ให้ routine แก้แล้วส่งใหม่):
 *   - ความยาว body ต้องอยู่ในช่วง BODY_MIN_CHARS..BODY_MAX_CHARS (นับช่องว่าง)
 *   - หัวข้อต้องไม่ซ้ำกับที่เคยเขียน (ทุกสถานะ รวม published/rejected)
 * รูปปก: ไม่ส่ง image_url มา → หารูปฟรีจาก Pexels/Unsplash ด้วย image_query (ไม่มีคีย์ = รูปสต็อกในโค้ด)
 */
export async function ingestArticle(input: {
  topic: string;
  title: string;
  body: string;
  excerpt?: string;
  image_url?: string;
  image_query?: string; // คำค้นภาษาอังกฤษสำหรับหารูปฟรี
  refs?: string | null; // แหล่งอ้างอิง (คั่นบรรทัด) → คอมเมนต์ใต้โพสต์ FB
  scheduled_at?: string; // slot ที่ routine กำหนด (UTC ISO); ไม่ส่งมา = หาช่องว่างถัดไปเอง
}): Promise<Article> {
  const { min, max } = bodyLenRange();
  const len = input.body.length; // นับรวมช่องว่างตามที่เจ้าของกำหนด
  if (len < min || len > max) {
    throw new BodyLengthError(len, min, max);
  }
  const dup = await findDuplicate(input.topic, input.title);
  if (dup) {
    throw new DuplicateTopicError(dup);
  }
  const image_url =
    (input.image_url || "").trim() ||
    (await findFreeImage((input.image_query || "").trim() || input.topic, input.topic, input.title));

  return bufferArticle({
    topic: input.topic,
    title: input.title,
    body: input.body,
    excerpt: (input.excerpt || "").trim() || deriveExcerpt(input.body),
    image_url,
    refs: (input.refs || "").toString().trim() || null,
    scheduled_at: input.scheduled_at,
  });
}

/** สถานะคลัง buffer (ให้ routine เช็กว่าต้องเติมไหม) */
export async function getBufferPlan(): Promise<BufferPlan> {
  const queued = await listQueued();
  return computePlan(queued, new Date(), postTimes(), bufferTargetItems(), bufferMinItems());
}

/**
 * ถึงเวลาการ์ด (11/14/16/20) → หยิบบทความในคลังที่จองเวลานั้นไว้ → ยิงการ์ดรออนุมัติเข้ากลุ่ม LINE
 * ยังไม่โพสต์อะไรลงเพจ — รอเจ้าของกด ✅ (approveArticle)
 * ยิงการ์ดไม่สำเร็จ → คืนสถานะกลับ pending ให้ cron รอบถัดไปลองใหม่
 */
export async function releaseDue(nowISO?: string): Promise<{ released: Article[]; failed: number }> {
  const now = nowISO || new Date().toISOString();
  const due = await listPendingDue(now);
  const released: Article[] = [];
  let failed = 0;

  for (const a of due) {
    // claim ก่อนยิง — กันการ์ดซ้ำเมื่อ cron สองรอบทับกัน
    const claimed = await claimForRelease(a.id);
    if (!claimed) continue;

    const flex = buildDraftFlex(claimed, siteUrl());
    let sentLive = false;
    let pushError = "";
    try {
      sentLive = await pushFlexToGroup(flex.altText, flex.contents);
    } catch (e) {
      pushError = (e as Error).message; // เช่น 429 โควตาข้อความ LINE หมดเดือนนี้
    }
    if (!sentLive && lineReady()) {
      // LINE ของจริงแต่ยิงไม่ออก (โควตาหมด/token/เน็ต) → คืนเข้าคลัง ให้ cron รอบหน้าลองใหม่
      // ต้องไม่ throw ออกไป ไม่งั้นบทความค้างสถานะ scheduled ทั้งที่การ์ดไม่เคยถึงกลุ่ม
      await updateArticle(a.id, { status: "pending" });
      failed++;
      if (pushError) {
        await addLineMessage("draft", `[push ล้ม] ${claimed.title} — ${pushError}`, claimed.id);
      }
      continue;
    }
    await addLineMessage("draft", (sentLive ? "" : "[mock] ") + `📝 การ์ดรออนุมัติ: ${claimed.title}`, claimed.id);
    released.push(claimed);
  }

  return { released, failed };
}

/**
 * เจ้าของกด ✅ ในกลุ่ม → โพสต์ลงเพจ FB + คอมเมนต์อ้างอิง + คอมเมนต์ลิงก์ LINE OA แล้วขึ้นเว็บ
 * claim (scheduled→published) ก่อนโพสต์ → กดซ้ำ/สองคนกดพร้อมกันก็โพสต์ครั้งเดียว
 * PUBLISH_ENABLED ยังไม่เปิด = ไม่โพสต์ ไม่เปลี่ยนสถานะ (คงรออนุมัติไว้ให้กดใหม่ทีหลัง)
 */
export async function approveArticle(id: string): Promise<{
  ok: boolean;
  error?: string;
  article?: Article;
  postUrl?: string;
  link?: string;
}> {
  if (!publishEnabled()) {
    return { ok: false, error: "PUBLISH_ENABLED ยังปิดอยู่ — ยังโพสต์ลงเพจจริงไม่ได้" };
  }
  const a = await getArticle(id);
  if (!a) return { ok: false, error: "ไม่พบบทความนี้" };

  const now = new Date().toISOString();
  const claimed = await claimForPublish(id, now);
  if (!claimed) {
    return { ok: false, error: `บทความนี้ไม่ได้อยู่ในสถานะรออนุมัติแล้ว (${a.status})` };
  }

  const link = `${siteUrl()}/article/${a.id}`;
  let fb: FbPostResult;
  try {
    fb = await postToPage(a.body, { imageUrl: a.image_url || undefined, link });
  } catch (e) {
    // โพสต์ล้มหลัง claim → คืนสถานะให้กดอนุมัติใหม่ได้ (ไม่ปล่อยค้างเป็น published ที่ไม่มีโพสต์)
    await updateArticle(id, { status: "scheduled", published_at: null });
    return { ok: false, error: `โพสต์ลงเพจไม่สำเร็จ: ${(e as Error).message}`, link };
  }

  // คอมเมนต์ใต้โพสต์ (best-effort — ล้มแล้วไม่กระทบการโพสต์)
  // คอมเมนต์ชวนแอด LINE OA ถูกถอดออกตามคำสั่งเจ้าของ 2026-07-31
  // (คำสั่งของงานนี้คือ "โพสต์ลงเพจเฟซบุ๊ก" อย่างเดียว ไม่มีการโปรโมต LINE OA)
  if (fb.posted && a.refs) {
    await commentOnPost(fb.postId, a.refs);
  }
  const updated = await updateArticle(id, { fb_post_id: fb.postId });
  const postUrl = fbPostUrl(fb.postId);
  await addLineMessage(
    "publish_confirm",
    `✅ อนุมัติแล้ว โพสต์ลงเพจ: ${a.title}\n${postUrl || fb.postId}\nเว็บ: ${link}`,
    id
  );
  return { ok: true, article: updated || claimed, postUrl: postUrl || undefined, link };
}

/** เจ้าของกด 🚫 → ไม่อนุมัติ (คลังชิ้นถัดไปจะมาตามเวลาการ์ดรอบต่อไปตามปกติ) */
export async function rejectArticle(id: string): Promise<{ ok: boolean; error?: string; article?: Article }> {
  const a = await getArticle(id);
  if (!a) return { ok: false, error: "ไม่พบบทความนี้" };
  if (a.status === "published") return { ok: false, error: "บทความนี้โพสต์ลงเพจไปแล้ว" };
  const updated = await updateArticle(id, { status: "rejected" });
  return { ok: true, article: updated || a };
}

/**
 * เช็กคลังบทความ — คิดเป็น "จำนวนวันที่ยังปล่อยได้" ไม่ใช่จำนวนชิ้น
 * เหลือน้อยกว่า BUFFER_ALERT_DAYS (ดีฟอลต์ 3 วัน) → เตือนเข้ากลุ่ม LINE
 * เพื่อให้เจ้าของรู้ว่าต้องเปิดคอมให้ routine เขียนเติม (routine รันได้เฉพาะตอนแอปเปิด)
 */
export async function stockCheck(): Promise<{
  count: number;
  perDay: number;
  daysLeft: number;
  target: number;
  alertDays: number;
  alerted: boolean;
}> {
  const count = await countPending();
  const perDay = Math.max(1, postTimes().length);
  const daysLeft = Math.round((count / perDay) * 10) / 10;
  const alertDays = bufferAlertDays();
  const target = bufferTargetItems();
  let alerted = false;

  if (daysLeft < alertDays) {
    const text =
      `⚠️ คลังบทความ SiamAthlete เหลือน้อย\n` +
      `เหลือ ${count} ชิ้น = พอปล่อยอีก ${daysLeft} วัน (เกณฑ์เตือน < ${alertDays} วัน · เป้า ${target} ชิ้น)\n` +
      `เปิดคอมทิ้งไว้ให้ routine "siamathlete-article-buffer" เขียนเติมด้วยนะคะ\n` +
      `ดูคลังได้ที่ ${siteUrl()}/admin`;
    const sentLive = await pushToGroup(text);
    await addLineMessage("stock_alert", (sentLive ? "" : "[mock] ") + text);
    alerted = true;
  }

  return { count, perDay, daysLeft, target, alertDays, alerted };
}
