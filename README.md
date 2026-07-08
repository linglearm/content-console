# Content Console — SiamAthlete

ระบบปล่อยคอนเทนต์อัตโนมัติ — **AI เขียนบทความ + รูป → เก็บเป็นสต็อก → ส่งดราฟต์เข้ากลุ่ม LINE ให้อนุมัติ → ถึงเวลาปล่อยลงเว็บ + Facebook Fanpage อัตโนมัติ → สต็อกใกล้หมดแจ้งเตือน LINE**

**แบรนด์/ธีม:** เนื้อหาแนว **ฟิตเนส / เพาะกาย / วิทยาศาสตร์การออกกำลังกาย / โภชนาการ** (ปรับได้ที่ `CONTENT_THEME`)
- Facebook Page เป้าหมาย = **SiamAthlete** (เพจที่มีอยู่แล้ว)
- LINE OA = **สร้างใหม่ในเฟส 2**
- ชื่อเว็บ = ตั้ง placeholder `NEXT_PUBLIC_SITE_NAME` ไว้ก่อน (เจ้าของเคาะชื่อ/โดเมนจริงทีหลัง)

Stack: **Next.js + Tailwind (Vercel)** · **Supabase (Postgres + Storage)** · **Claude API** (สลับเป็น Gemini ได้) · **Pollinations** (รูปฟรี) · **LINE Messaging API** · **Facebook Graph API** · **GitHub Actions** (cron)

---

## โหมด Mock (เฟส 1 — ใช้ได้เลยโดยไม่ต้องมีความลับ)

ถ้ายังไม่ได้เติม key จริงใน `.env.local` ระบบจะทำงานใน **MOCK MODE** อัตโนมัติ:
เก็บข้อมูลในหน่วยความจำ, ไม่ยิง API ภายนอก, มีบทความตัวอย่างให้ลองเล่นฟลว์ครบ

```bash
npm install
npm run dev
# เปิด http://localhost:3000        → บล็อกสาธารณะ
# เปิด http://localhost:3000/admin  → หลังบ้าน (เกจสต็อก, สร้างบทความ, คิว, แผง LINE)
# เปิด http://localhost:3000/contact→ หน้าติดต่อ
```

ลองในหลังบ้าน: พิมพ์หัวข้อ → **สร้างบทความใหม่** (ได้ดราฟต์ mock + เห็นข้อความเข้าแผง LINE) →
**อนุมัติ + ตั้งเวลา** (เป็นอดีตเพื่อทดสอบ) → กด **รันปล่อยโพสต์** → บทความขึ้นหน้าเว็บ + เห็นข้อความยืนยันในแผง LINE

> โครงการนี้ทำงานได้ทั้งแบบ mock และของจริงจากโค้ดชุดเดียว — พอเติม key ครบ บริการนั้นจะสลับเป็น "live" เอง (ดูแถบสถานะบนสุดของหลังบ้าน)

---

## โครงสร้างสำคัญ

```
src/lib/          env.ts (ตรวจ key/โหมด), store.ts (Supabase↔mock), content.ts (3 ฟังก์ชันหลัก)
                  claude.ts, gemini.ts, pollinations.ts, line.ts, facebook.ts
src/app/api/      generate · publish-due · stock-check · articles · line/webhook · line/messages
                  contact · settings · admin/run
src/app/          / (บล็อก) · /article/[id] · /contact · /admin
supabase/         schema.sql (ตาราง + RLS) · storage.sql (bucket รูป)
.github/workflows publish-due.yml (ทุก 10 นาที) · stock-check.yml (วันละ 2 รอบ)
```

3 ฟังก์ชันหลัก (ใน `src/lib/content.ts`):
- **generateArticle(topic)** — เขียน+ทำรูป → บันทึก `pending` → ส่งดราฟต์เข้า LINE
- **publishDue()** — ดึง `scheduled` ที่ถึงเวลา → โพสต์เว็บ+FB → `published` → ยืนยันเข้า LINE
- **stockCheck()** — นับ `scheduled` ต่ำกว่าเกณฑ์ → แจ้งเตือน LINE

---

## 🔒 สิ่งที่ต้องเตรียมเอง (เฟส 2) และวางค่าไว้บรรทัดไหนของ `.env`

คัดลอก `.env.example` → `.env.local` แล้วเติมค่าจริงตามนี้:

### 1) Supabase (ฐานข้อมูล + รูป)
1. สมัคร https://supabase.com → New project
2. Project Settings → **API** → คัดลอกค่า:
   - `Project URL` → **`NEXT_PUBLIC_SUPABASE_URL`**
   - `anon public` → **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**
   - `service_role` → **`SUPABASE_SERVICE_ROLE_KEY`** (ความลับ! ใช้ฝั่ง server เท่านั้น)
3. SQL Editor → วางไฟล์ `supabase/schema.sql` → Run แล้ว `supabase/storage.sql` → Run

### 2) Claude API (ผู้เขียนบทความ)
1. https://console.anthropic.com → API Keys → Create Key
2. วางที่ **`ANTHROPIC_API_KEY`** · (เลือกโมเดลที่ **`ANTHROPIC_MODEL`**, ค่าเริ่มต้น `claude-opus-4-8`; ประหยัดกว่าใช้ `claude-sonnet-5`)
3. *(ทางเลือก)* จะสลับไป Gemini: ตั้ง `TEXT_PROVIDER=gemini` + ใส่ **`GEMINI_API_KEY`** จาก https://aistudio.google.com/apikey

### 3) LINE OA + Messaging API (แจ้งเตือน + อนุมัติ) — *สร้างใหม่*
1. https://developers.line.biz/console/ → สร้าง Provider → **Create a Messaging API channel** (จะได้ LINE OA ใหม่)
2. แท็บ **Messaging API**:
   - **Channel access token (long-lived)** → Issue → วางที่ **`LINE_CHANNEL_ACCESS_TOKEN`**
   - ตั้ง **Webhook URL** = `https://<โดเมน Vercel>/api/line/webhook` และเปิด **Use webhook**
3. แท็บ **Basic settings** → **Channel secret** → วางที่ **`LINE_CHANNEL_SECRET`**
4. **เชิญบอทเข้ากลุ่ม LINE** ของคุณ แล้วหา group id:
   - วิธีง่าย: ในกลุ่ม พิมพ์คำว่า `groupid` แล้วบอทจะตอบ group id กลับมา → วางที่ **`LINE_GROUP_ID`**
   - (webhook ต้องออนไลน์บน Vercel ก่อน วิธีนี้ถึงใช้ได้)

### 4) Facebook Graph API (โพสต์เพจ **SiamAthlete**)
1. https://developers.facebook.com/ → **Create App** (ประเภท Business)
2. ใช้ **Graph API Explorer** ขอ token ที่มีสิทธิ์: **`pages_manage_posts`**, **`pages_read_engagement`**
3. เลือกเพจ **SiamAthlete** → คัดลอก **Page Access Token** (แนะนำแลกเป็น long-lived — ดู Access Token Debugger) → วางที่ **`FACEBOOK_PAGE_ACCESS_TOKEN`**
4. เอา **Page ID** ของ SiamAthlete (หน้าเพจ → About) → วางที่ **`FACEBOOK_PAGE_ID`**

### 5) Cron + เว็บไซต์
- **`NEXT_PUBLIC_SITE_URL`** = โดเมน Vercel ของคุณ (เช่น `https://xxx.vercel.app`)
- **`CRON_SECRET`** = สุ่มสตริงยาวๆ (ใช้ป้องกัน endpoint cron)

### 6) Deploy Vercel + ตั้ง cron
1. push โปรเจกต์ขึ้น GitHub → https://vercel.com → Import repo
2. Vercel → Project → Settings → **Environment Variables** → ใส่ทุกตัวจาก `.env.local`
3. GitHub repo → Settings → **Secrets and variables → Actions** → เพิ่ม:
   - `SITE_URL` = โดเมน Vercel · `CRON_SECRET` = ค่าเดียวกับใน env
   - (GitHub Actions ใน `.github/workflows/` จะยิง `publish-due` ทุก 10 นาที และ `stock-check` วันละ 2 รอบ)

> ทางเลือกแทน GitHub Actions: ใช้ **Supabase pg_cron** เรียก endpoint เดียวกันก็ได้

---

## ทดสอบครบลูป (เฟส 2)
สร้างบทความ → ดราฟต์เข้า LINE → กดอนุมัติ+ตั้งเวลา (หรือพิมพ์ `อนุมัติ <id> <เวลา>` ในกลุ่ม LINE) →
ถึงเวลา `publish-due` ยิง → บทความขึ้นเว็บ + โพสต์ FB จริง → ถ้าสต็อกต่ำ `stock-check` แจ้งเตือน LINE

---

## หมายเหตุความปลอดภัย
- หน้า `/admin` ยังไม่มีระบบล็อกอินในเฟสนี้ (เป็นเครื่องมือส่วนตัว) — ถ้า deploy สาธารณะควรเพิ่ม auth (เช่น Vercel Password / middleware) เป็นงานถัดไป
- `SUPABASE_SERVICE_ROLE_KEY`, tokens ต่างๆ เป็นความลับ — อย่า commit `.env.local`
