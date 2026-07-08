"use client";

export function StockGauge({
  count,
  target,
  threshold,
}: {
  count: number;
  target: number;
  threshold: number;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((count / target) * 100)) : 0;
  const low = count < threshold;

  return (
    <div className="rounded-lg border bg-white p-5">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-semibold">เกจสต็อกบทความ (รอปล่อย)</h3>
        <span className={`text-2xl font-bold ${low ? "text-red-600" : "text-brand-600"}`}>
          {count}
          <span className="text-base font-normal text-gray-400"> / {target}</span>
        </span>
      </div>
      <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${low ? "bg-red-500" : "bg-brand-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`mt-2 text-sm ${low ? "text-red-600" : "text-gray-500"}`}>
        {low
          ? `⚠️ ต่ำกว่าเกณฑ์ (< ${threshold}) — ควรสร้างบทความเพิ่ม`
          : `ปกติ (เกณฑ์เตือนเมื่อต่ำกว่า ${threshold})`}
      </p>
    </div>
  );
}
