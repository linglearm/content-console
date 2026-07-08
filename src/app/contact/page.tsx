"use client";

import { useState } from "react";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", contact: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setStatus("done");
      setForm({ name: "", contact: "", message: "" });
    } else {
      setStatus("error");
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">ติดต่อเรา</h1>

      <div className="flex gap-3 mb-8">
        <a
          href={process.env.NEXT_PUBLIC_LINE_URL || "https://line.me"}
          target="_blank"
          rel="noreferrer"
          className="rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600"
        >
          LINE OA
        </a>
        <a
          href={process.env.NEXT_PUBLIC_FACEBOOK_URL || "https://facebook.com/SiamAthlete"}
          target="_blank"
          rel="noreferrer"
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Facebook: SiamAthlete
        </a>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-lg border bg-white p-6">
        <div>
          <label className="block text-sm font-medium mb-1">ชื่อ</label>
          <input
            className="w-full rounded border px-3 py-2"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">ช่องทางติดต่อกลับ (อีเมล/เบอร์)</label>
          <input
            className="w-full rounded border px-3 py-2"
            value={form.contact}
            onChange={(e) => setForm({ ...form, contact: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">ข้อความ *</label>
          <textarea
            required
            rows={4}
            className="w-full rounded border px-3 py-2"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
          />
        </div>
        <button
          type="submit"
          disabled={status === "sending"}
          className="rounded bg-brand-500 px-4 py-2 text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {status === "sending" ? "กำลังส่ง…" : "ส่งข้อความ"}
        </button>
        {status === "done" && <p className="text-green-600 text-sm">ส่งเรียบร้อยแล้ว ขอบคุณครับ 🙏</p>}
        {status === "error" && <p className="text-red-600 text-sm">เกิดข้อผิดพลาด ลองใหม่อีกครั้ง</p>}
      </form>
    </div>
  );
}
