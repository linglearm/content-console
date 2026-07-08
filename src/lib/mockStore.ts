/**
 * MOCK STORE — เก็บข้อมูลในหน่วยความจำของ process (ใช้ตอนยังไม่มี Supabase)
 * ใช้ globalThis กันไม่ให้ข้อมูลรีเซ็ตตอน Next.js hot-reload ในโหมด dev
 */
import type { Article, ContactMessage, LineMessage, Settings } from "./types";

interface MockDB {
  articles: Article[];
  lineMessages: LineMessage[];
  contacts: ContactMessage[];
  settings: Settings;
  seeded: boolean;
}

const g = globalThis as unknown as { __contentConsoleDB?: MockDB };

function nowMinus(days: number, hours = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}

function seed(): MockDB {
  const db: MockDB = {
    articles: [],
    lineMessages: [],
    contacts: [],
    settings: {
      stock_target: Number(process.env.STOCK_TARGET || 10),
      stock_threshold: Number(process.env.STOCK_THRESHOLD || 3),
    },
    seeded: true,
  };

  // บทความตัวอย่าง (ธีม SiamAthlete): published 2 ชิ้น, scheduled 2 ชิ้น, pending 1 ชิ้น
  const samples: Array<Partial<Article>> = [
    {
      topic: "โปรตีนต่อวันสำหรับสร้างกล้าม",
      title: "กินโปรตีนวันละเท่าไหร่ถึงสร้างกล้ามได้จริง (อ้างอิงงานวิจัย)",
      status: "published",
      published_at: nowMinus(2),
      fb_post_id: "1234567890_1111",
    },
    {
      topic: "Progressive Overload",
      title: "Progressive Overload: หัวใจของการเพิ่มกล้ามที่มือใหม่มักพลาด",
      status: "published",
      published_at: nowMinus(1),
      fb_post_id: "1234567890_2222",
    },
    {
      topic: "ท่าสควอทที่ถูกต้อง",
      title: "สควอทให้ถูกฟอร์ม ลดเสี่ยงบาดเจ็บ เพิ่มแรงขา",
      status: "scheduled",
      scheduled_at: nowMinus(-1), // ในอนาคต 1 วัน
    },
    {
      topic: "ครีเอทีนใช้ยังไง",
      title: "ครีเอทีน (Creatine) กินยังไงให้ได้ผล ปลอดภัยไหม?",
      status: "scheduled",
      scheduled_at: nowMinus(-2),
    },
    {
      topic: "ลดไขมันคงกล้ามเนื้อ",
      title: "คัตไขมันโดยไม่เสียกล้าม: จัดแคลอรี่และโปรตีนยังไง",
      status: "pending",
    },
  ];

  db.articles = samples.map((s, i) => ({
    id: `mock-${i + 1}`,
    topic: s.topic!,
    title: s.title!,
    body:
      `# ${s.title}\n\nนี่คือเนื้อหาตัวอย่าง (mock) แนวฟิตเนส/เพาะกาย สำหรับหัวข้อ "${s.topic}" ` +
      `ใช้ทดสอบการแสดงผลในเฟส 1 โดยยังไม่เรียก AI จริง\n\n` +
      `## หลักการฝึก\n- โปรแกรมฝึก (training)\n- โภชนาการ (nutrition)\n- การพักฟื้น (recovery)\n\n` +
      `สรุป: เนื้อหานี้จะถูกแทนที่ด้วยบทความจริงที่ AI เขียน เมื่อใส่ ANTHROPIC_API_KEY แล้ว`,
    excerpt: `บทความตัวอย่างแนวฟิตเนส/เพาะกายเกี่ยวกับ ${s.topic} สำหรับทดสอบระบบในเฟส 1`,
    image_url: `https://image.pollinations.ai/prompt/${encodeURIComponent(s.topic!)}?width=1024&height=576&nologo=true`,
    status: (s.status as Article["status"]) || "pending",
    scheduled_at: s.scheduled_at ?? null,
    published_at: s.published_at ?? null,
    fb_post_id: s.fb_post_id ?? null,
    created_at: nowMinus(3 - i),
  }));

  // ตัวอย่างข้อความในกลุ่ม LINE
  db.lineMessages = [
    {
      id: "lm-1",
      kind: "publish_confirm",
      article_id: "mock-2",
      text: "✅ เผยแพร่แล้ว: Progressive Overload: หัวใจของการเพิ่มกล้ามที่มือใหม่มักพลาด\nเว็บ: /article/mock-2 | FB (SiamAthlete): โพสต์แล้ว",
      created_at: nowMinus(1),
    },
  ];

  return db;
}

export function db(): MockDB {
  if (!g.__contentConsoleDB) {
    g.__contentConsoleDB = seed();
  }
  return g.__contentConsoleDB;
}
