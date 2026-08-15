# Content Console — สะพานลงคอมเมนต์ให้ "Human of Fit"

> **2026-08-15 — โปรเจกต์นี้ถูกลดบทบาทตามคำสั่งเจ้าของ**
> สายผลิตคอนเทนต์ SiamAthlete (AI เขียนบทความ → คลัง → การ์ดอนุมัติเข้ากลุ่ม LINE →
> โพสต์ลงเพจอัตโนมัติ → เตือนคลังใกล้หมด) **ถูกถอดออกทั้งชุด** ไม่ใช่แค่ปิดสวิตช์
> ประวัติเดิมอยู่ใน git ย้อนดูได้ · **อย่าเอากลับเข้ามาโดยไม่ได้ตกลงกันก่อน**

ตอนนี้เหลือหน้าที่เดียว: **ลงคอมเมนต์ใต้โพสต์ของเพจ Human of Fit ให้ระบบ Jongrak Health**
กับหน้าเว็บอ่านบทความเก่าแบบอ่านอย่างเดียว (คงไว้ไม่ให้ลิงก์ที่เคยส่งออกไปพัง)

Stack: **Next.js + Tailwind (Vercel)** · **Supabase (Postgres)** · **Facebook Graph API**

---

## เส้นเดียวที่ยังทำงาน — Human of Fit

```
jongrakhealth: ระบบเขียนบทความ (ChatGPT) → การ์ดเข้ากลุ่ม LINE "จงรักษ์สุขภาพ Web App"
   → เจ้าของเอารูป+บทความไปโพสต์เองบนเพจ Human of Fit
   → ก๊อปลิงก์โพสต์วางกลับในกลุ่มเดิม
   → jongrakhealth ออกตั๋วใช้ครั้งเดียว ส่งมาที่  POST /api/human-of-fit/facebook
   → ตรวจว่าโพสต์อยู่บนเพจที่ตั้งค่าไว้จริง แล้วลงคอมเมนต์ REF → 3/3 → 2/3 → 1/3
```

**ระบบนี้ไม่สร้างโพสต์เอง** — เจ้าของโพสต์เอง ระบบมาต่อคอมเมนต์เท่านั้น
`src/lib/facebook.ts` จึงไม่มีฟังก์ชันสร้างโพสต์เหลืออยู่เลย (ถอด `postToPage` ออกแล้ว)

**ทำไม Jongrak Health ไม่ทำเองเลย:** ฝั่งนั้น**จงใจไม่ถือ Facebook token** มันอ้าง QA-passed
article แล้วออกตั๋วอายุสั้นใช้ครั้งเดียวส่งมาที่นี่ ตั๋วถูกแลกผ่าน RPC ของฐาน HOF ซึ่งเป็นคนคืน
URL ของเจ้าของและตัวคอมเมนต์ที่แก้ไม่ได้กลับมา → ความลับของเพจอยู่ที่โปรเจกต์นี้ที่เดียว

### ❗ ห้ามปิด/ลบโปรเจกต์นี้

เส้น Human of Fit ทั้งเส้นวิ่งผ่าน `/api/human-of-fit/facebook` ที่นี่
ปิด deployment เมื่อไหร่ = คอมเมนต์ใต้โพสต์บนเพจหยุดทำงานทันที และฝั่ง jongrakhealth
จะตอบกลับในกลุ่ม LINE ว่าระบบขัดข้อง

---

## โครงสร้างที่เหลือ

```
src/lib/     env.ts (ตรวจ key/โหมด) · facebook.ts (อ่านโพสต์ + ลงคอมเมนต์ — ไม่สร้างโพสต์)
             hof-facebook.ts (ประกอบคอมเมนต์ 4 ใบ) · hof-facebook-bridge.ts (ลำดับ+retry)
             store.ts · supabase.ts · mockStore.ts · types.ts (ใช้โดยหน้าเว็บอ่านบทความ)
src/app/api/ human-of-fit/facebook (เส้นหลัก) · contact
src/app/     / (รายการบทความเก่า) · /article/[id] · /contact
supabase/    schema.sql · storage.sql
```

`vercel.json` มี `"crons": []` — **ไม่มี cron เหลืออยู่** ตัวเดิม (`release-due` ทุก 10 นาที ·
`stock-check` รายวัน) ถูกถอดพร้อมสายผลิต

---

## env ที่ยังต้องมี

| ตัวแปร | ใช้ทำอะไร |
|---|---|
| `FACEBOOK_PAGE_ID` | **Page ID ของเพจ Human of Fit** |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Page Access Token ของเพจเดียวกัน · สิทธิ์ **`pages_read_engagement`** + **`pages_manage_engagement`** (คอมเมนต์) |
| `FACEBOOK_GRAPH_VERSION` | ไม่ตั้ง = `v21.0` |
| `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` | ฐานของโปรเจกต์นี้ (หน้าเว็บบทความเก่า + ฟอร์มติดต่อ) |
| `NEXT_PUBLIC_SITE_NAME` · `NEXT_PUBLIC_SITE_URL` | ชื่อ/โดเมนเว็บ |

❗ **`FACEBOOK_PAGE_ID` ต้องเป็นเพจ Human of Fit เท่านั้น**
`verifyPagePost()` ผูกกับค่านี้ทุกทาง (`normalizePagePostId` · `lookupPagePostById` ·
`findPagePostByUrl`) ตั้งเป็นเพจอื่นเมื่อไหร่ = คอมเมนต์ลงไม่ได้สักใบ และ error ที่ได้คือ
`facebook_post_page_mismatch` / `post_id_not_on_configured_page` ซึ่งอ่านแล้วไม่รู้ว่าเพราะตั้ง env ผิด

ยืนยันว่าตั้งถูกไหม:
```
https://graph.facebook.com/v21.0/me?fields=id,name&access_token=<PAGE_TOKEN>
```
→ `name` ต้องขึ้นชื่อเพจ **Human of Fit**

env ที่ไม่ต้องใช้แล้ว (ถอนได้จาก Vercel): `ANTHROPIC_API_KEY` · `GEMINI_API_KEY` ·
`TEXT_PROVIDER` · `LINE_CHANNEL_ACCESS_TOKEN` · `LINE_CHANNEL_SECRET` · `LINE_GROUP_ID` ·
`PUBLISH_ENABLED` · `POST_TIMES` · `BUFFER_*` · `BODY_*` · `PEXELS_API_KEY` ·
`UNSPLASH_ACCESS_KEY` · `CONTENT_THEME` · `CRON_SECRET`

---

## ทดสอบ

```bash
npm install
npm run test:hof   # 16 เคส — ลำดับคอมเมนต์ · ล้มกลางคัน · retry ไม่คอมเมนต์ซ้ำ
npm run build
```

`npm run test:hof` ครอบเส้น Human of Fit ทั้งเส้นโดยไม่ต้องยิง Facebook จริง
(ฉีด dependency เข้า `deliverHofFacebookComments`) — **แก้เส้นนี้เมื่อไหร่ต้องรันให้เขียวก่อนเสมอ**

---

## หมายเหตุความปลอดภัย
- `SUPABASE_SERVICE_ROLE_KEY` และ Page token เป็นความลับ — อย่า commit `.env.local`
- `/api/human-of-fit/facebook` เปิดสาธารณะโดยตั้งใจ แต่กันด้วยตั๋วใช้ครั้งเดียวที่ต้องแลกผ่าน
  RPC ของฐาน HOF ก่อนเสมอ — ตั๋วไม่ผ่าน = ตอบ 401 ทันที ไม่แตะ Facebook เลย
