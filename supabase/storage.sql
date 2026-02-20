-- ============================================================
-- SWINDON AIRSOFT — Supabase Storage Buckets
-- Run this in: Supabase Dashboard → SQL Editor (after schema.sql)
-- ============================================================

-- Create storage bucket for all site images
insert into storage.buckets (id, name, public) values
  ('images', 'images', true);

-- Allow anyone to read images
create policy "Public image access"
  on storage.objects for select
  using (bucket_id = 'images');

-- Allow authenticated users to upload images
create policy "Authenticated users can upload images"
  on storage.objects for insert
  with check (bucket_id = 'images' and auth.role() = 'authenticated');

-- Allow admin/staff to delete images
create policy "Admins can delete images"
  on storage.objects for delete
  using (
    bucket_id = 'images' and
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'staff')
    )
  );
