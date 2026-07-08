-- ==========================================================================
--  content-console — โครงสร้างฐานข้อมูล (รันในเฟส 2)
--  วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
-- ==========================================================================

create extension if not exists "pgcrypto";

-- ---- ตารางบทความ ---------------------------------------------------------
create table if not exists public.articles (
  id           uuid primary key default gen_random_uuid(),
  topic        text not null,
  title        text not null,
  body         text not null,
  excerpt      text not null default '',        -- คำโปรย (ใช้แสดงการ์ด/โพสต์)
  image_url    text,
  status       text not null default 'pending'  -- pending | scheduled | published
                 check (status in ('pending','scheduled','published')),
  scheduled_at timestamptz,
  published_at timestamptz,
  fb_post_id   text,
  created_at   timestamptz not null default now()
);

create index if not exists articles_status_idx        on public.articles (status);
create index if not exists articles_scheduled_at_idx   on public.articles (scheduled_at);
create index if not exists articles_published_at_idx   on public.articles (published_at desc);

-- ---- ข้อความที่ระบบส่งเข้ากลุ่ม LINE (outbox) ---------------------------
create table if not exists public.line_messages (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('draft','stock_alert','publish_confirm')),
  article_id  uuid references public.articles(id) on delete set null,
  text        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists line_messages_created_idx on public.line_messages (created_at desc);

-- ---- การตั้งค่า (แถวเดียว id=1) ------------------------------------------
create table if not exists public.settings (
  id              int primary key default 1,
  stock_target    int not null default 10,
  stock_threshold int not null default 3
);
insert into public.settings (id, stock_target, stock_threshold)
  values (1, 10, 3)
  on conflict (id) do nothing;

-- ---- ข้อความจากฟอร์มติดต่อ ----------------------------------------------
create table if not exists public.contacts (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  contact    text,
  message    text not null,
  created_at timestamptz not null default now()
);

-- ==========================================================================
--  Row Level Security
--  - หน้าเว็บสาธารณะใช้ anon key อ่านเฉพาะบทความ published
--  - งานเขียน/อัปเดตทั้งหมดทำผ่าน service_role (ข้าม RLS อยู่แล้ว)
-- ==========================================================================
alter table public.articles      enable row level security;
alter table public.line_messages enable row level security;
alter table public.settings      enable row level security;
alter table public.contacts      enable row level security;

-- อ่านบทความ published ได้แบบสาธารณะ
drop policy if exists "public read published articles" on public.articles;
create policy "public read published articles"
  on public.articles for select
  using (status = 'published');

-- ใครก็ส่งฟอร์มติดต่อได้ (insert เท่านั้น)
drop policy if exists "public insert contacts" on public.contacts;
create policy "public insert contacts"
  on public.contacts for insert
  with check (true);

-- line_messages / settings ไม่มี policy สำหรับ anon → เข้าถึงได้เฉพาะ service_role
