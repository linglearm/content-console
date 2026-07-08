/**
 * SCHEDULE — คำนวณ "ช่องเวลาโพสต์" (slot) ล่วงหน้า และสถานะ buffer
 * ใช้เวลาไทย Asia/Bangkok (UTC+7 ไม่มี DST) แต่คืนค่า scheduled_at เป็น UTC ISO
 *
 * แนวคิด: กำหนดเวลาโพสต์ต่อวัน (เช่น 10:00/16:00/19:00/21:00) → สร้างรายการ slot
 * ล่วงหน้า N วัน → เทียบกับบทความที่ตั้งเวลาไว้แล้ว → รู้ว่าช่องไหนว่าง และคิวเหลือกี่วัน
 */
import type { Article } from "./types";

const TZ_OFFSET_MIN = 420; // Asia/Bangkok = UTC+7

export interface Slot {
  scheduled_at: string; // UTC ISO — ใช้เป็นค่า scheduled_at ของบทความ
  bkk_date: string; // YYYY-MM-DD (เวลาไทย)
  bkk_time: string; // HH:MM (เวลาไทย)
  pillar: string; // เสาหลัก A/B/C/D/E/F ที่แนะนำสำหรับ slot นี้
}

export interface BufferPlan {
  postsPerDay: number;
  targetDays: number;
  minDays: number;
  scheduledFuture: number; // จำนวนบทความที่ตั้งเวลาไว้ในอนาคต
  daysCovered: number; // คิวครอบคลุมกี่วัน
  needRefill: boolean; // ต่ำกว่า minDays → ควรเติม
  openSlots: Slot[]; // ช่องว่างที่ควรเติม (เรียงจากใกล้สุด) ถึงเป้า targetDays
}

/** แตกวันที่แบบเวลาไทยจาก Date */
function bkkYMD(d: Date): { y: number; m: number; day: number } {
  const b = new Date(d.getTime() + TZ_OFFSET_MIN * 60000);
  return { y: b.getUTCFullYear(), m: b.getUTCMonth(), day: b.getUTCDate() };
}

/** สร้าง Date (UTC) จากเวลาไทย: วันฐาน + offset วัน ที่ HH:MM */
function slotUtc(base: { y: number; m: number; day: number }, dayOffset: number, hh: number, mm: number): Date {
  const wallMs = Date.UTC(base.y, base.m, base.day + dayOffset, hh, mm, 0, 0); // เวลาไทยเสมือน UTC
  return new Date(wallMs - TZ_OFFSET_MIN * 60000); // แปลงกลับเป็น UTC จริง
}

/** map เวลาไทย (ชั่วโมง) + เลขวันคู่/คี่ → เสาหลัก (ตามบรีฟ SiamAthlete) */
export function pillarFor(bkkDay: number, hh: number): string {
  if (hh < 13) return "A"; // ~เช้า/สาย: การฝึก
  if (hh < 18) return "B"; // ~บ่าย: โภชนาการ/ลดไขมัน
  if (hh < 20) return bkkDay % 2 === 0 ? "C" : "D"; // ~หัวค่ำ: ฮอร์โมน (คู่) / เตรียมแข่ง (คี่)
  return bkkDay % 2 === 0 ? "E" : "F"; // ~ดึก: ประวัติ AAS (คู่) / เชิงลึก (คี่)
}

/** เลขนาทีของ epoch (ใช้จับคู่ slot กับ scheduled_at โดยไม่สนรูปแบบ string) */
function epochMin(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 60000);
}

/** สร้างรายการ slot ล่วงหน้า nDays วัน (เฉพาะที่ยังไม่ถึง) เรียงจากใกล้สุด */
export function buildSlots(now: Date, nDays: number, times: string[]): Slot[] {
  const base = bkkYMD(now);
  const out: Slot[] = [];
  for (let d = 0; d <= nDays; d++) {
    for (const t of times) {
      const [hhStr, mmStr] = t.split(":");
      const hh = Number(hhStr);
      const mm = Number(mmStr || 0);
      if (Number.isNaN(hh)) continue;
      const utc = slotUtc(base, d, hh, mm);
      if (utc.getTime() <= now.getTime()) continue; // ผ่านไปแล้ว ข้าม
      const bp = bkkYMD(utc);
      out.push({
        scheduled_at: utc.toISOString(),
        bkk_date: `${bp.y}-${String(bp.m + 1).padStart(2, "0")}-${String(bp.day).padStart(2, "0")}`,
        bkk_time: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
        pillar: pillarFor(bp.day, hh),
      });
    }
  }
  out.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  return out.slice(0, nDays * times.length);
}

/** เซ็ตของนาที epoch ที่ถูกจองแล้ว (บทความที่ตั้งเวลาไว้ในอนาคต) */
function takenMinutes(scheduled: Article[], now: Date): Set<number> {
  const s = new Set<number>();
  for (const a of scheduled) {
    if (a.scheduled_at && new Date(a.scheduled_at).getTime() > now.getTime()) {
      s.add(epochMin(a.scheduled_at));
    }
  }
  return s;
}

/** สถานะ buffer + ช่องว่างที่ควรเติม */
export function computePlan(
  scheduled: Article[],
  now: Date,
  times: string[],
  targetDays: number,
  minDays: number
): BufferPlan {
  const postsPerDay = Math.max(1, times.length);
  const slots = buildSlots(now, targetDays, times);
  const taken = takenMinutes(scheduled, now);
  const openSlots = slots.filter((s) => !taken.has(epochMin(s.scheduled_at)));
  const scheduledFuture = taken.size;
  const daysCovered = scheduledFuture / postsPerDay;
  return {
    postsPerDay,
    targetDays,
    minDays,
    scheduledFuture,
    daysCovered: Math.round(daysCovered * 10) / 10,
    needRefill: daysCovered < minDays,
    openSlots,
  };
}

/** ช่องว่างแรกสุด (ใช้ตอน ingest ไม่ได้ระบุ scheduled_at มา) — ขยายเกิน targetDays ได้ถ้าเต็ม */
export function firstOpenSlot(scheduled: Article[], now: Date, times: string[], maxDays: number): string {
  const slots = buildSlots(now, maxDays, times);
  const taken = takenMinutes(scheduled, now);
  const open = slots.find((s) => !taken.has(epochMin(s.scheduled_at)));
  if (open) return open.scheduled_at;
  // ทุกช่องเต็ม → ต่อท้ายช่องสุดท้าย (กันกรณีสุดโต่ง)
  return slots[slots.length - 1]?.scheduled_at || now.toISOString();
}
