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
  // การเขียน (แก้ไข/เปลี่ยนรูป/ลบ) ถูกล็อกด้วย CRON_SECRET ฝั่ง API — เก็บไว้ในเครื่องนี้เครื่องเดียว
  const [secret, setSecret] = useState("");

  /** header สำหรับทุก request ที่ "เขียน" — ไม่มีรหัส API จะตอบ 401 */
  const writeHeaders = useCallback(
    (): Record<string, string> => ({ "content-type": "application/json", "x-cron-secret": secret }),
    [secret]
  );

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
    setSecret(localStorage.getItem("cc_write_secret") || "");
  }, [load]);

  function rememberSecret(v: string) {
    setSecret(v);
    localStorage.setItem("cc_write_secret", v);
  }

  // คลัง = บทความที่ยังไม่ได้โพสต์ (pending รอการ์ด + scheduled ส่งการ์ดแล้วรออนุมัติ)
  const bufferCount = articles.filter((a) => a.status === "pending" || a.status === "scheduled").length;

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
    setNote(res.ok ? "สร้างแล้ว — เข้าคิวตั้งเวลาปล่อยอัตโนมัติแล้ว" : `ผิดพลาด: ${data.error}`);
    setTopic("");
    await load();
    setBusy(false);
  }

  /** เปลี่ยน "เวลาที่การ์ดจะเข้ากลุ่ม" (ไม่ใช่อนุมัติ — อนุมัติกดในกลุ่ม LINE) */
  async function setCardTime(id: string, scheduledISO: string) {
    const res = await fetch(`/api/articles/${id}`, {
      method: "PATCH",
      headers: writeHeaders(),
      body: JSON.stringify({ scheduled_at: scheduledISO }),
    });
    if (!res.ok) setNote(res.status === 401 ? "ต้องใส่รหัสเขียน (CRON_SECRET) ก่อน" : "เปลี่ยนเวลาไม่สำเร็จ");
    await load();
  }
  async function save(id: string, patch: Partial<Article>) {
    const res = await fetch(`/api/articles/${id}`, {
      method: "PATCH",
      headers: writeHeaders(),
      body: JSON.stringify(patch),
    });
    if (!res.ok) setNote(res.status === 401 ? "ต้องใส่รหัสเขียน (CRON_SECRET) ก่อน" : "บันทึกไม่สำเร็จ");
    await load();
  }
  async function del(id: string) {
    const res = await fetch(`/api/articles/${id}`, { method: "DELETE", headers: writeHeaders() });
    if (!res.ok) setNote(res.status === 401 ? "ต้องใส่รหัสเขียน (CRON_SECRET) ก่อน" : "ลบไม่สำเร็จ");
    await load();
  }
  /** หารูปฟรีใหม่จาก Pexels/Unsplash ให้การ์ดนี้ (ยังไม่บันทึก — ให้กดบันทึกเอง) */
  async function findImage(query: string, topic: string): Promise<string | null> {
    const res = await fetch(
      `/api/image-search?${new URLSearchParams({ q: query, topic, seed: Math.random().toString(36).slice(2, 8) })}`,
      { headers: { "x-cron-secret": secret } }
    );
    if (!res.ok) {
      setNote(res.status === 401 ? "ต้องใส่รหัสเขียน (CRON_SECRET) ก่อน" : "หารูปไม่สำเร็จ");
      return null;
    }
    const d = await res.json();
    return d.url || null;
  }

  async function runStock() {
    setBusy(true);
    setNote("กำลังเช็กสต็อก…");
    const res = await fetch("/api/admin/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task: "stock" }),
    });
    const data = await res.json();
    setNote(`สต็อก ${data.count} ชิ้น ${data.alerted ? "(แจ้งเตือนแล้ว)" : "(ปกติ)"}`);
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
          <label className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-gray-500">รหัสเขียน (CRON_SECRET):</span>
            <input
              type="password"
              value={secret}
              onChange={(e) => rememberSecret(e.target.value)}
              placeholder="วางรหัสครั้งเดียว จำไว้ในเครื่องนี้"
              className="w-64 rounded border px-2 py-1"
            />
            <span className="text-xs text-gray-400">
              ต้องมีรหัสจึงจะแก้บทความ/เปลี่ยนรูป/ลบได้ (กันคนนอกยิงแก้คิว)
            </span>
          </label>
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
          <StockGauge count={bufferCount} target={settings.stock_target} threshold={settings.stock_threshold} />
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
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-400">ปล่อยโพสต์อัตโนมัติผ่านคิว (Vercel Cron)</span>
              <button onClick={runStock} disabled={busy} className="rounded border px-3 py-1.5 hover:bg-gray-100">
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
                onSetCardTime={setCardTime}
                onSave={save}
                onDelete={del}
                onFindImage={findImage}
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
