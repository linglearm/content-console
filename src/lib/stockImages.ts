/**
 * STOCK IMAGES — รูปฟรีจาก Unsplash (Unsplash License: ใช้เชิงพาณิชย์ได้ ไม่ต้องให้เครดิต)
 * ใช้ช่วงเริ่มต้นแทนรูป AI (Pollinations) เพราะได้ภาพถ่ายจริงสวยกว่า และฟรี ไม่ต้องมี API key
 * เลือกรูปตามเสาหลัก/หัวข้อ + seed เพื่อกระจายไม่ให้ซ้ำติดกัน
 * ทุก URL เช็กแล้วว่าคืน 200 image/jpeg และภาพตรงธีมฟิตเนส/โภชนาการ
 */
const P = "?auto=format&fit=crop&w=1200&h=675&q=80";
const U = (id: string) => `https://images.unsplash.com/photo-${id}${P}`;

// การฝึก/ยิม/คาร์ดิโอ (เสาหลัก A + ค่าเริ่มต้น)
const TRAIN = [
  U("1517836357463-d25dfeac3438"), // deadlift setup
  U("1534438327276-14e5300c3a48"), // dumbbell rack
  U("1583454110551-21f2fa2afe61"), // grabbing dumbbell
  U("1517838277536-f5f99be501cd"), // lifting plate
  U("1571019613454-1cb2f99b2d8b"), // sit-ups / core
  U("1548690312-e3b507d8c110"), // battle rope
  U("1532384748853-8f54a8f476e2"), // dumbbell row
  U("1550345332-09e3ac987658"), // squat (b&w)
];

// สรีระ/กล้าม/เพาะกาย (เสาหลัก C/D/E/F)
const PHYSIQUE = [
  U("1581009146145-b5ef050c2e1e"), // muscular curl
  U("1526506118085-60ce8714f8c5"), // back muscles (b&w)
  U("1550345332-09e3ac987658"),
  U("1548690312-e3b507d8c110"),
  U("1532384748853-8f54a8f476e2"),
];

// โภชนาการ/อาหารคลีน (เสาหลัก B)
const FOOD = [
  U("1490645935967-10de6ba17061"), // egg + avocado bowl
  U("1546069901-ba9599a7e63c"), // salmon salad bowl
  U("1512621776951-a57141f2eefd"), // chickpea avocado bowl
  U("1490474418585-ba9bad8fd0ea"), // fruit platter
  U("1543339308-43e59d6b73a6"), // sweet potato salad
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function poolFor(topic: string): string[] {
  const first = topic.trim().charAt(0).toUpperCase();
  if (first === "B" || /(โภชนา|ไขมัน|อาหาร|โปรตีน|คาร์บ|กิน|ไดเอท|แคลอรี|creatine|คาร์ดิโอ)/i.test(topic)) {
    return [...FOOD, ...TRAIN];
  }
  if (["C", "D", "E", "F"].includes(first)) return [...PHYSIQUE, ...TRAIN];
  return TRAIN; // A + ค่าเริ่มต้น
}

/** เลือกรูปสต็อกฟรีตามหัวข้อ — seed (เช่น title) ช่วยให้โพสต์ต่างชิ้นได้รูปต่างกัน */
export function stockImageUrl(topic: string, seed = ""): string {
  const list = poolFor(topic);
  return list[hash(`${topic}|${seed}`) % list.length];
}
