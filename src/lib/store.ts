/**
 * STORE — ชั้นข้อมูลกลาง เลือกใช้ Supabase (ของจริง) หรือ mock อัตโนมัติ
 * ทุก API route เรียกผ่านที่นี่ ไม่ต้องรู้ว่าเบื้องหลังคืออะไร
 */
import { supabaseReady } from "./env";
import { supabaseService } from "./supabase";
import { db } from "./mockStore";
import type { Article, ArticleStatus, ContactMessage, LineMessage, LineMessageKind, Settings } from "./types";

function uuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

/**
 * ชื่อตาราง — รองรับ prefix (ตั้งผ่าน SUPABASE_TABLE_PREFIX)
 * กรณีแชร์ฐานข้อมูลกับโปรเจกต์อื่น ใช้ prefix เช่น "sa_" เพื่อไม่ให้ตารางชนกัน
 */
const TABLE_PREFIX = process.env.SUPABASE_TABLE_PREFIX || "";
const T = {
  articles: `${TABLE_PREFIX}articles`,
  line_messages: `${TABLE_PREFIX}line_messages`,
  settings: `${TABLE_PREFIX}settings`,
  contacts: `${TABLE_PREFIX}contacts`,
};

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

export async function listArticles(opts?: { status?: ArticleStatus }): Promise<Article[]> {
  if (supabaseReady()) {
    let q = supabaseService().from(T.articles).select("*").order("created_at", { ascending: false });
    if (opts?.status) q = q.eq("status", opts.status);
    const { data, error } = await q;
    if (error) throw error;
    return (data as Article[]) || [];
  }
  let rows = [...db().articles].sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (opts?.status) rows = rows.filter((a) => a.status === opts.status);
  return rows;
}

/** บทความ published สำหรับหน้าเว็บสาธารณะ (เรียงตามวันที่เผยแพร่ล่าสุด) */
export async function listPublished(): Promise<Article[]> {
  const rows = await listArticles({ status: "published" });
  return rows.sort((a, b) => (b.published_at || "").localeCompare(a.published_at || ""));
}

export async function getArticle(id: string): Promise<Article | null> {
  if (supabaseReady()) {
    const { data, error } = await supabaseService().from(T.articles).select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data as Article) || null;
  }
  return db().articles.find((a) => a.id === id) || null;
}

export async function createArticle(input: {
  topic: string;
  title: string;
  body: string;
  excerpt: string;
  image_url: string | null;
  refs?: string | null;
  status?: ArticleStatus;
}): Promise<Article> {
  const row: Article = {
    id: uuid(),
    topic: input.topic,
    title: input.title,
    body: input.body,
    excerpt: input.excerpt,
    image_url: input.image_url,
    refs: input.refs ?? null,
    status: input.status || "pending",
    scheduled_at: null,
    published_at: null,
    fb_post_id: null,
    created_at: new Date().toISOString(),
  };
  if (supabaseReady()) {
    const { data, error } = await supabaseService().from(T.articles).insert(row).select().single();
    if (error) throw error;
    return data as Article;
  }
  db().articles.push(row);
  return row;
}

export async function updateArticle(id: string, patch: Partial<Article>): Promise<Article | null> {
  if (supabaseReady()) {
    const { data, error } = await supabaseService().from(T.articles).update(patch).eq("id", id).select().maybeSingle();
    if (error) throw error;
    return (data as Article) || null;
  }
  const a = db().articles.find((x) => x.id === id);
  if (!a) return null;
  Object.assign(a, patch);
  return a;
}

export async function deleteArticle(id: string): Promise<void> {
  if (supabaseReady()) {
    const { error } = await supabaseService().from(T.articles).delete().eq("id", id);
    if (error) throw error;
    return;
  }
  const arr = db().articles;
  const idx = arr.findIndex((a) => a.id === id);
  if (idx >= 0) arr.splice(idx, 1);
}

export async function countScheduled(): Promise<number> {
  const rows = await listArticles({ status: "scheduled" });
  return rows.length;
}

/** บทความ scheduled ที่ถึงเวลาปล่อยแล้ว (scheduled_at <= now) */
export async function listDue(nowISO: string): Promise<Article[]> {
  const rows = await listArticles({ status: "scheduled" });
  return rows.filter((a) => a.scheduled_at && a.scheduled_at <= nowISO);
}

// ---------------------------------------------------------------------------
// Settings (แถวเดียว)
// ---------------------------------------------------------------------------

export async function getSettings(): Promise<Settings> {
  if (supabaseReady()) {
    const { data } = await supabaseService().from(T.settings).select("*").eq("id", 1).maybeSingle();
    if (data) return { stock_target: data.stock_target, stock_threshold: data.stock_threshold };
    // ยังไม่มีแถว → สร้าง default
    const def: Settings = {
      stock_target: Number(process.env.STOCK_TARGET || 10),
      stock_threshold: Number(process.env.STOCK_THRESHOLD || 3),
    };
    await supabaseService().from(T.settings).upsert({ id: 1, ...def });
    return def;
  }
  return db().settings;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  if (supabaseReady()) {
    await supabaseService().from(T.settings).upsert({ id: 1, ...next });
    return next;
  }
  db().settings = next;
  return next;
}

// ---------------------------------------------------------------------------
// LINE outbox (ข้อความที่ระบบส่งเข้ากลุ่ม — เก็บไว้แสดงในหลังบ้าน)
// ---------------------------------------------------------------------------

export async function addLineMessage(kind: LineMessageKind, text: string, article_id: string | null = null): Promise<LineMessage> {
  const row: LineMessage = {
    id: uuid(),
    kind,
    article_id,
    text,
    created_at: new Date().toISOString(),
  };
  if (supabaseReady()) {
    const { data, error } = await supabaseService().from(T.line_messages).insert(row).select().single();
    if (error) throw error;
    return data as LineMessage;
  }
  db().lineMessages.unshift(row);
  return row;
}

export async function listLineMessages(limit = 50): Promise<LineMessage[]> {
  if (supabaseReady()) {
    const { data, error } = await supabaseService()
      .from(T.line_messages)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as LineMessage[]) || [];
  }
  return db().lineMessages.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Contacts (ฟอร์มติดต่อจากหน้าเว็บ)
// ---------------------------------------------------------------------------

export async function addContact(input: { name: string; contact: string; message: string }): Promise<ContactMessage> {
  const row: ContactMessage = {
    id: uuid(),
    name: input.name,
    contact: input.contact,
    message: input.message,
    created_at: new Date().toISOString(),
  };
  if (supabaseReady()) {
    const { data, error } = await supabaseService().from(T.contacts).insert(row).select().single();
    if (error) throw error;
    return data as ContactMessage;
  }
  db().contacts.unshift(row);
  return row;
}
