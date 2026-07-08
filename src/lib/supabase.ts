import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase clients:
 *  - service client: ฝั่ง server (มี service_role key) ใช้เขียน/อ่านทุกอย่าง
 *  - public client: ใช้ anon key อ่านเฉพาะบทความ published (RLS อนุญาต)
 * เรียกใช้เมื่อ supabaseReady()/supabasePublicReady() เป็น true เท่านั้น
 */

let _service: SupabaseClient | null = null;
export function supabaseService(): SupabaseClient {
  if (_service) return _service;
  _service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  return _service;
}

let _public: SupabaseClient | null = null;
export function supabasePublic(): SupabaseClient {
  if (_public) return _public;
  _public = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  return _public;
}

export const BUCKET = process.env.SUPABASE_BUCKET || "article-images";
