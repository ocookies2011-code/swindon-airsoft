-- ============================================================
-- Run this in Supabase → SQL Editor
-- ============================================================

-- 1. Cash sales table
create table if not exists public.cash_sales (
  id          uuid primary key default uuid_generate_v4(),
  customer_name text not null default 'Walk-in',
  customer_email text default '',
  user_id     uuid references public.profiles(id) on delete set null,
  items       jsonb not null default '[]',
  total       numeric(10,2) not null default 0,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.cash_sales enable row level security;

create policy "Admins can manage cash sales"
  on public.cash_sales for all using (public.is_admin_or_staff());

-- 2. Fix Q&A RLS (allow insert)
drop policy if exists "Admins can manage Q&A" on public.qa_items;
create policy "Admins can manage Q&A"
  on public.qa_items for all using (public.is_admin_or_staff())
  with check (public.is_admin_or_staff());

-- 3. Fix site_settings RLS (allow upsert)
drop policy if exists "Admins can manage settings" on public.site_settings;
create policy "Admins can manage settings"
  on public.site_settings for all using (public.is_admin_or_staff())
  with check (public.is_admin_or_staff());

-- 4. Fix gallery RLS (allow insert)
drop policy if exists "Admins can manage albums" on public.gallery_albums;
drop policy if exists "Admins can manage images" on public.gallery_images;
create policy "Admins can manage albums"
  on public.gallery_albums for all using (public.is_admin_or_staff())
  with check (public.is_admin_or_staff());
create policy "Admins can manage images"
  on public.gallery_images for all using (public.is_admin_or_staff())
  with check (public.is_admin_or_staff());

-- 5. Fix storage policy for image uploads
drop policy if exists "Authenticated users can upload images" on storage.objects;
create policy "Authenticated users can upload images"
  on storage.objects for insert
  with check (bucket_id = 'images' and auth.uid() is not null);

-- 6. Allow admins to create users without email confirmation
-- Go to: Supabase Dashboard → Authentication → Settings
-- Turn OFF "Enable email confirmations"
-- (This cannot be done via SQL - must be done in the dashboard)
