"use client";

import { useState } from "react";
import type { Article, ArticleStatus } from "@/lib/types";

const STAGES: ArticleStatus[] = ["pending", "scheduled", "published"];
const STATUS_LABEL: Record<ArticleStatus, string> = {
  pending: "รออนุมัติ",
  scheduled: "ตั้งเวลาแล้ว",
  published: "เผยแพร่แล้ว",
  rejected: "ไม่อนุมัติ",
};
const STATUS_COLOR: Record<ArticleStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  scheduled: "bg-blue-100 text-blue-700",
  published: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

export function ArticleCard({
  article,
  onApprove,
  onSave,
  onDelete,
  defaultEditing = false,
}: {
  article: Article;
  onApprove: (id: string, scheduledISO: string) => Promise<void>;
  onSave: (id: string, patch: Partial<Article>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  defaultEditing?: boolean;
}) {
  const [editing, setEditing] = useState(defaultEditing);
  const [title, setTitle] = useState(article.title);
  const [excerpt, setExcerpt] = useState(article.excerpt);
  const [body, setBody] = useState(article.body);
  const [when, setWhen] = useState(toLocalInput(article.scheduled_at) || toLocalInput(new Date().toISOString()));
  const [busy, setBusy] = useState(false);

  const stageIdx = STAGES.indexOf(article.status);

  async function approve() {
    if (!when) return;
    setBusy(true);
    await onApprove(article.id, new Date(when).toISOString());
    setBusy(false);
  }
  async function save() {
    setBusy(true);
    await onSave(article.id, { title, excerpt, body });
    setBusy(false);
    setEditing(false);
  }
  async function del() {
    if (!confirm("ลบบทความนี้?")) return;
    setBusy(true);
    await onDelete(article.id);
    setBusy(false);
  }

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      <div className="flex gap-4 p-4">
        {article.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={article.image_url} alt="" className="w-28 h-20 object-cover rounded flex-shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[article.status]}`}>
              {STATUS_LABEL[article.status]}
            </span>
            <span className="text-xs text-gray-400 truncate">หัวข้อ: {article.topic}</span>
          </div>
          <h3 className="font-semibold leading-snug truncate">{article.title}</h3>
          <p className="text-sm text-gray-500 line-clamp-2">{article.excerpt}</p>

          {/* แถบสเตจ */}
          <div className="flex items-center gap-1 mt-3">
            {STAGES.map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <div
                  className={`h-1.5 w-12 rounded-full ${i <= stageIdx ? "bg-brand-500" : "bg-gray-200"}`}
                  title={STATUS_LABEL[s]}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* แผงจัดการ */}
      <div className="border-t bg-gray-50 px-4 py-3 space-y-3">
        {article.status !== "published" && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="rounded border px-2 py-1 text-sm"
            />
            <button
              onClick={approve}
              disabled={busy}
              className="rounded bg-brand-500 px-3 py-1.5 text-sm text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {article.status === "pending" ? "อนุมัติ + ตั้งเวลา" : "เปลี่ยนเวลา"}
            </button>
          </div>
        )}
        <div className="flex gap-2 text-sm">
          <button onClick={() => setEditing((v) => !v)} className="rounded border px-3 py-1.5 hover:bg-gray-100">
            {editing ? "ปิดแก้ไข" : "แก้ไข"}
          </button>
          <button onClick={del} disabled={busy} className="rounded border border-red-200 px-3 py-1.5 text-red-600 hover:bg-red-50">
            ลบ
          </button>
          {article.published_at && (
            <span className="ml-auto self-center text-xs text-gray-400">
              เผยแพร่: {new Date(article.published_at).toLocaleString("th-TH")}
              {article.fb_post_id ? ` · FB:${article.fb_post_id}` : ""}
            </span>
          )}
        </div>

        {editing && (
          <div className="space-y-2 pt-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border px-2 py-1 text-sm"
              placeholder="หัวเรื่อง"
            />
            <input
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              className="w-full rounded border px-2 py-1 text-sm"
              placeholder="คำโปรย"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full rounded border px-2 py-1 text-sm font-mono"
              placeholder="เนื้อหา (Markdown)"
            />
            <button
              onClick={save}
              disabled={busy}
              className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
            >
              บันทึกการแก้ไข
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
