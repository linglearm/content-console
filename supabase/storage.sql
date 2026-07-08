-- ==========================================================================
--  content-console — สร้าง Storage bucket สำหรับเก็บรูปบทความ (รันในเฟส 2)
--  วิธีใช้: Supabase Dashboard → SQL Editor → วางไฟล์นี้ → Run
--  หรือสร้างผ่านหน้า Storage เอง: New bucket ชื่อ "article-images" ตั้งเป็น Public
-- ==========================================================================

-- สร้าง bucket แบบ public (อ่านรูปได้จาก URL ตรง)
insert into storage.buckets (id, name, public)
values ('article-images', 'article-images', true)
on conflict (id) do nothing;

-- อนุญาตให้อ่านไฟล์ใน bucket นี้ได้แบบสาธารณะ
drop policy if exists "public read article images" on storage.objects;
create policy "public read article images"
  on storage.objects for select
  using (bucket_id = 'article-images');

-- การอัปโหลด/ลบทำผ่าน service_role (ข้าม RLS) จากฝั่ง server อยู่แล้ว
-- หมายเหตุ: เฟส 1 ใช้ URL จาก Pollinations ตรงๆ ยังไม่ต้องอัปโหลดเข้า bucket ก็ได้
