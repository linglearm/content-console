"use client";

import { useCallback, useEffect, useState } from "react";
import type { Article, LineMessage, Settings } from "@/lib/types";
import { StockGauge } from "./StockGauge";
import { ArticleCard } from "./ArticleCard";
import { LinePanel } from "./LinePanel";

interface ServiceStatus {
  mode: string;
  supabase: boolean;
  claude: boolean;
  gemini: boolean;
  line: boolean;
  facebook: boolean;
  textProvider: string;
  publishEnabled: boolean;
}

export function AdminDashboard() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [messages, setMessages] = useState<LineMessage[]>([]);
  const [settings, setSettings] = useState<Settings>({ stock_target: 10, stock_threshold: 3 });
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [editId, setEditId] = useState<string | null>(null); // จากลิงก์ ?edit=<id> (ปุ่มแก้ไขในการ์ด LINE)

  const load = useCallback(async () => {
    const [a, m, s] = await Promise.all([
      fetch("/api/articles").then((r) => r.json()),
      fetch("/api/line/messages").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]);
    setArticles(a.articles || []);
    setMessages(m.messages || []);
    setSettings(s.settings);
    setStatus(s.status);
  }, []);

  useEffect(() => {
    load();
    // เปิดฟอร์มแก้ไขอัตโนมัติถ้ามาจากปุ่ม "แก้ไข" ในการ์ด LINE (?edit=<id>)
    const p = new URLSearchParams(window.location.search);
    setEditId(p.get("edit"));
  }, [load]);

  const scheduledCount = articles.filter((a) => a.status === "scheduled").length;

  async function generate() {
    if (!topic.trim()) return;
    setBusy(true);
    setNote("กำลังสร้างบทความ…");
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic }),
    });
    const data = await res.json();
    setNote(res.ok ? "สร้างแล้ว — ดราฟต์ถูกส่งเข้ากลุ่ม LINE" : `ผิดพลาด: ${data.error}`);
    setTopic("");
    await load();
    setBusy(false);
  }

  async function approve(id: string, scheduledISO: string) {
    await fetch(`/api/articles/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scheduled_at: scheduledISO }),
    });
    await load();
  }
  async function save(id: string, patch: Partial<Article>) {
    await fetch(`/api/articles/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    await load();
  }
  async function del(id: string) {
    await fetch(`/api/articles/${id}`, { method: "DELETE" });
    await load();
  }

  async function runTask(task: "publish" | "stock") {
    setBusy(true);
    setNote(task === "publish" ? "กำลังปล่อยบทความที่ถึงเวลา…" : "กำลังเช็กสต็อก…");
    const res = await fetch("/api/admin/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task }),
    });
    const data = await res.json();
    setNote(
      task === "publish"
        ? `ปล่อยแล้ว ${data.publishedCount ?? 0} ชิ้น`
        : `สต็อก ${data.count} ชิ้น ${data.alerted ? "(แจ้งเตือนแล้ว)" : "(ปกติ)"}`
    );
    await load();
    setBusy(false);
  }

  async function saveSettings(next: Settings) {
    setSettings(next);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    await load();
  }

  return (
    <div className="space-y-6">
      {/* สถานะบริการ */}
      {status && (
        <div className="rounded-lg border bg-white p-4 text-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-medium">สถานะบริการ:</span>
            {[
              ["Supabase", status.supabase],
              [`AI (${status.textProvider})`, status.textProvider === "gemini" ? status.gemini : status.claude],
              ["LINE", status.line],
              ["Facebook", status.facebook],
            ].map(([label, ok]) => (
              <span key={label as string} className="inline-flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${ok ? "bg-green-500" : "bg-gray-300"}`} />
                {label as string}
                <span className="text-gray-400">{ok ? "live" : "mock"}</span>
              </span>
            ))}
          </div>
          <p className={`mt-2 font-medium ${status.publishEnabled ? "text-green-600" : "text-red-600"}`}>
            {status.publishEnabled
              ? "🟢 การปล่อยจริงเปิดอยู่ — บทความที่ถึงเวลาจะโพสต์ลงเว็บ + เพจ SiamAthlete จริง"
              : "🔴 การปล่อยจริงปิดอยู่ (PUBLISH_ENABLED=false) — ยังไม่โพสต์ลงเพจจริง (รอเจ้าของเปิดสวิตช์)"}
          </p>
          {[status.supabase, status.line, status.facebook].some((x) => !x) && (
            <p className="mt-1 text-amber-600">
              ⚠️ ยังมีบริการที่เป็น mock — เติม key ใน .env (ดู README)
            </p>
          )}
        </div>
      )}

      {/* แถวบน: เกจ + สร้างบทความ */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <StockGauge count={scheduledCount} target={settings.stock_target} threshold={settings.stock_threshold} />
          <div className="rounded-lg border bg-white p-4 flex flex-wrap items-end gap-3 text-sm">
            <label className="block">
              <span className="text-gray-500">เป้าสต็อก</span>
              <input
                type="number"
                value={settings.stock_target}
                onChange={(e) => saveSettings({ ...settings, stock_target: Number(e.target.value) })}
                className="mt-1 w-20 rounded border px-2 py-1"
              />
            </label>
            <label className="block">
              <span className="text-gray-500">เกณฑ์เตือน (ต่ำกว่า)</span>
              <input
                type="number"
                value={settings.stock_threshold}
                onChange={(e) => saveSettings({ ...settings, stock_threshold: Number(e.target.value) })}
                className="mt-1 w-20 rounded border px-2 py-1"
              />
            </label>
            <div className="ml-auto flex gap-2">
              <button onClick={() => runTask("publish")} disabled={busy} className="rounded border px-3 py-1.5 hover:bg-gray-100">
                รันปล่อยโพสต์
              </button>
              <button onClick={() => runTask("stock")} disabled={busy} className="rounded border px-3 py-1.5 hover:bg-gray-100">
                รันเช็กสต็อก
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-5">
          <h3 className="font-semibold mb-3">สร้างบทความใหม่</h3>
          <div className="flex gap-2">
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generate()}
              placeholder="พิมพ์หัวข้อ เช่น 'วิธีชงชาเขียว'"
              className="flex-1 rounded border px-3 py-2"
            />
            <button
              onClick={generate}
              disabled={busy || !topic.trim()}
              className="rounded bg-brand-500 px-4 py-2 text-white hover:bg-brand-600 disabled:opacity-50"
            >
              สร้างบทความใหม่
            </button>
          </div>
          {note && <p className="mt-3 text-sm text-gray-600">{note}</p>}
        </div>
      </div>

      {/* แถวล่าง: คิวบทความ + แผง LINE */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <h3 className="font-semibold">คิวบทความ ({articles.length})</h3>
          {articles.length === 0 ? (
            <p className="text-gray-400 text-sm">ยังไม่มีบทความ — ลองสร้างจากช่องด้านบน</p>
          ) : (
            articles.map((a) => (
              <ArticleCard
                key={a.id}
                article={a}
                onApprove={approve}
                onSave={save}
                onDelete={del}
                defaultEditing={a.id === editId}
              />
            ))
          )}
        </div>
        <div>
          <LinePanel messages={messages} />
        </div>
      </div>
    </div>
  );
}
