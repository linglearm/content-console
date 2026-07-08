"use client";

import type { LineMessage, LineMessageKind } from "@/lib/types";

const KIND_LABEL: Record<LineMessageKind, string> = {
  draft: "ดราฟต์รออนุมัติ",
  stock_alert: "แจ้งเตือนสต็อก",
  publish_confirm: "ยืนยันโพสต์",
};
const KIND_COLOR: Record<LineMessageKind, string> = {
  draft: "bg-amber-100 text-amber-700",
  stock_alert: "bg-red-100 text-red-700",
  publish_confirm: "bg-green-100 text-green-700",
};

export function LinePanel({ messages }: { messages: LineMessage[] }) {
  return (
    <div className="rounded-lg border bg-white p-5">
      <h3 className="font-semibold mb-3">แผงข้อความในกลุ่ม LINE</h3>
      {messages.length === 0 ? (
        <p className="text-sm text-gray-400">ยังไม่มีข้อความ</p>
      ) : (
        <ul className="space-y-3 max-h-[520px] overflow-y-auto">
          {messages.map((m) => (
            <li key={m.id} className="rounded border bg-gray-50 p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${KIND_COLOR[m.kind]}`}>{KIND_LABEL[m.kind]}</span>
                <span className="text-xs text-gray-400">{new Date(m.created_at).toLocaleString("th-TH")}</span>
              </div>
              <pre className="whitespace-pre-wrap break-words text-sm text-gray-700 font-sans">{m.text}</pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
