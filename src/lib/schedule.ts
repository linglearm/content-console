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
  pillar: string; // รหัสเสาหลักของช่วงเวลานี้ (A/B/C/D)
  pillarName: string; // ชื่อเสาหลักภาษาไทย
  topicHints: string; // คลังหัวข้อของเสาหลักนั้น (ให้ routine เลือกไปเขียน)
}

export interface BufferPlan {
  postsPerDay: number;
  targetItems: number; // เป้าจำนวนบทความในคลัง
  minItems: number; // ต่ำกว่านี้ = ต้องเติม
  inBuffer: number; // จำนวนบทความในคลัง (pending) + ที่ส่งการ์ดแล้วรออนุมัติ (scheduled)
  daysCovered: number; // คลังพอใช้กี่วัน
  needRefill: boolean;
  openSlots: Slot[]; // ช่องเวลาว่างที่ควรเติม (เรียงจากใกล้สุด) ให้ครบเป้า
}

/**
 * คลังหัวข้อแยกตามเวลาการ์ด (บรีฟของเจ้าของเพจ SiamAthlete)
 * key = เวลาไทย HH:MM ใน POST_TIMES · ถ้าเพิ่มเวลาใหม่ใน env ต้องมาเพิ่มที่นี่ด้วย
 */
export const SLOT_PILLARS: Record<string, { code: string; name: string; hints: string }> = {
  "11:00": {
    code: "A",
    name: "การฝึก (เบื้องต้น → advance)",
    hints:
      "mechanical tension vs metabolic stress vs muscle damage / progressive overload ที่มากกว่าแค่เพิ่มน้ำหนัก / " +
      "volume landmarks MEV-MAV-MRV / เล่นถึง failure จำเป็นไหม / ช่วง rep เรื่องจริงเรื่องหลอก / frequency เล่นกล้ามเดิมกี่วันครั้ง / " +
      "rest period สั้นหรือยาว / eccentric & tempo / mind-muscle connection มีผลจริงไหม / full ROM vs partial / periodization / " +
      "exercise selection ตาม biomechanics และ resistance profile / deload / compound vs isolation",
  },
  "14:00": {
    code: "B",
    name: "โภชนาการ / ลดไขมัน",
    hints:
      "โปรตีนต่อวันเท่าไหร่จริงๆ + leucine threshold / anabolic window มีจริงไหม / energy balance คือของจริง / คาร์บกับไกลโคเจน / " +
      "ตัดไขมันต่ำไปพังฮอร์โมน / bulk-cut vs recomp / metabolic adaptation ทำไมยิ่งลดยิ่งยาก / NEAT ตัวแปรลับ / LISS vs HIIT / " +
      "fasted cardio เผาไขมันกว่าจริงไหม / refeed & diet break / creatine ได้อะไรบ้าง / supplement ไหนมีหลักฐานไหนทิ้งเงิน / " +
      "fiber & gut health / mitochondrial biogenesis / set point-leptin-ghrelin ร่างกายต้านการลด",
  },
  "16:00": {
    code: "C",
    name: "ฮอร์โมน & สรีรวิทยา + หัวข้อเชิงลึกที่คนไม่ค่อยพูด",
    hints:
      "testosterone สร้างยังไง ทำงานผ่าน androgen receptor / GH & IGF-1 / insulin ฮอร์โมน anabolic ที่คนเข้าใจผิด / " +
      "cortisol เครียดนอนน้อยพังกล้าม / mTOR & muscle protein synthesis / myostatin เบรกธรรมชาติ / androgen receptor density แต่ละมัด / " +
      "satellite cells & muscle memory / estrogen ในผู้ชายไม่ได้แย่อย่างที่คิด / thyroid & metabolic rate / นอนคือ anabolic / " +
      "สมดุล MPS vs MPB — เชิงลึก: enhanced vs natural ความต่างที่วงการไม่พูดตรงๆ / body dysmorphia-bigorexia / " +
      "genetics เพดานกล้าม insertion-fiber type-myonuclei / ผู้หญิงสร้างกล้ามทำไมไม่บึกเท่าผู้ชาย / sarcopenia / overtraining syndrome / " +
      "การตรวจเลือดที่คนจริงจังควรทำ / recovery กล้ามโตตอนพัก / injury prevention & prehab / PED harm ความเสี่ยงจริงที่การตลาดไม่บอก",
  },
  "20:00": {
    code: "D",
    name: "เตรียมแข่งเพาะกาย + ประวัติ AAS เพื่อการศึกษา",
    hints:
      "peak week ภาพรวม+ความเสี่ยง / water & sodium manipulation หลักการและอันตราย / carb depletion-loading / " +
      "รุ่นแข่งต่างกันยังไง Physique-Classic-Bodybuilding-Bikini / posing ตัดสินแพ้ชนะ / tanning & stage presentation / เกณฑ์ตัดสิน / " +
      "reverse dieting กันโยโย่ / timeline เริ่มคัตกี่สัปดาห์ / สภาพจิตใจช่วง prep — ประวัติ AAS: การสังเคราะห์ testosterone ปี 1935 " +
      "(Butenandt, Ruzicka, Nobel) / กำเนิด Dianabol กับ Dr.John Ziegler ยุคสงครามเย็น / ทำไมต้องมี ester / nandrolone ที่มาและการใช้ทางการแพทย์ / " +
      "ประวัติการโด๊ปในกีฬา+เคสดังที่เปลี่ยนวงการ / กำเนิด WADA / SARMs คืออะไร สถานะงานวิจัย / ผลข้างเคียงที่บันทึกในงานวิจัย " +
      "หัวใจ-ตับ-ฮอร์โมน-จิตใจ / ประวัติกฎหมายควบคุม / ตำนานยุคทองเพาะกาย",
  },
};

const FALLBACK_PILLAR = { code: "A", name: "การฝึก", hints: SLOT_PILLARS["11:00"].hints };

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

/** เสาหลักของช่องเวลา — ยึดตาราง SLOT_PILLARS (เวลาไทย HH:MM) */
export function pillarFor(bkkTime: string): { code: string; name: string; hints: string } {
  return SLOT_PILLARS[bkkTime] || FALLBACK_PILLAR;
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
      const bkk_time = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      const p = pillarFor(bkk_time);
      out.push({
        scheduled_at: utc.toISOString(),
        bkk_date: `${bp.y}-${String(bp.m + 1).padStart(2, "0")}-${String(bp.day).padStart(2, "0")}`,
        bkk_time,
        pillar: p.code,
        pillarName: p.name,
        topicHints: p.hints,
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

/**
 * สถานะคลัง buffer + ช่องเวลาว่างที่ควรเติม
 * queued = บทความที่ยังไม่ได้โพสต์ (pending ในคลัง + scheduled ที่ส่งการ์ดแล้วรออนุมัติ)
 * เป้าเป็น "จำนวนชิ้น" ไม่ใช่จำนวนวัน — openSlots คืนเท่าที่ยังขาดจากเป้า
 */
export function computePlan(
  queued: Article[],
  now: Date,
  times: string[],
  targetItems: number,
  minItems: number
): BufferPlan {
  const postsPerDay = Math.max(1, times.length);
  const inBuffer = queued.length;
  const needed = Math.max(0, targetItems - inBuffer);
  // มองไปข้างหน้าให้พอกับที่ขาด (+1 วันกันเศษ) แล้วคัดช่องที่ยังไม่มีใครจอง
  const horizonDays = Math.ceil(needed / postsPerDay) + 1;
  const slots = buildSlots(now, horizonDays, times);
  const taken = takenMinutes(queued, now);
  const openSlots = slots.filter((s) => !taken.has(epochMin(s.scheduled_at))).slice(0, needed);
  return {
    postsPerDay,
    targetItems,
    minItems,
    inBuffer,
    daysCovered: Math.round((inBuffer / postsPerDay) * 10) / 10,
    needRefill: inBuffer < minItems,
    openSlots,
  };
}

/**
 * เช็กว่า scheduled_at ตรงกับ "ช่องเวลามาตรฐาน" ไหม (เวลาไทยตรงกับ postTimes เป๊ะ นาที = 00)
 * ใช้กันการ re-time ผิดปกติ (เช่น bug ที่ดันเวลาเป็นทุก ~14 นาที) ไม่ให้ถูกปล่อยขึ้นเพจ
 */
export function isCanonicalSlot(iso: string | null, times: string[]): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const b = new Date(d.getTime() + TZ_OFFSET_MIN * 60000); // เวลาไทยเสมือน UTC
  const hh = b.getUTCHours();
  const mm = b.getUTCMinutes();
  return times.some((t) => {
    const [hStr, mStr] = t.split(":");
    return hh === Number(hStr) && mm === Number(mStr || 0);
  });
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
