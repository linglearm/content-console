export type ArticleStatus = "pending" | "scheduled" | "published";

export interface Article {
  id: string;
  topic: string;
  title: string;
  body: string;
  excerpt: string; // คำโปรย (ดึงจากช่วงต้นของ body ตอนสร้าง)
  image_url: string | null;
  status: ArticleStatus;
  scheduled_at: string | null; // ISO
  published_at: string | null; // ISO
  fb_post_id: string | null;
  created_at: string; // ISO
}

export type LineMessageKind = "draft" | "stock_alert" | "publish_confirm";

// ข้อความที่ระบบ "ส่งเข้ากลุ่ม LINE" — เก็บไว้แสดงในแผงหลังบ้าน
export interface LineMessage {
  id: string;
  kind: LineMessageKind;
  article_id: string | null;
  text: string;
  created_at: string;
}

export interface Settings {
  stock_target: number; // เป้าจำนวนบทความรอปล่อย
  stock_threshold: number; // ต่ำกว่านี้ = แจ้งเตือน
}

export interface ContactMessage {
  id: string;
  name: string;
  contact: string;
  message: string;
  created_at: string;
}
