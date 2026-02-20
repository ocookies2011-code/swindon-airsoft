-- ============================================================
-- SWINDON AIRSOFT — Supabase Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- Users (extends Supabase auth.users)
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '',
  phone       text default '',
  address     text default '',
  role        text not null default 'player' check (role in ('admin','staff','player')),
  games_attended integer not null default 0,
  waiver_signed  boolean not null default false,
  waiver_year    integer,
  waiver_data    jsonb,
  waiver_pending jsonb,
  vip_status     text not null default 'none' check (vip_status in ('none','active','expired')),
  vip_applied    boolean not null default false,
  ukara          text default '',
  credits        numeric(10,2) not null default 0,
  leaderboard_opt_out boolean not null default false,
  profile_pic    text default '',
  delete_request boolean not null default false,
  permissions    text[] default '{}',
  join_date      date not null default current_date,
  created_at     timestamptz not null default now()
);

-- Events
create table public.events (
  id           uuid primary key default uuid_generate_v4(),
  title        text not null,
  date         date not null,
  time         time not null default '09:00',
  location     text not null default '',
  description  text default '',
  walk_on_slots  integer not null default 40,
  rental_slots   integer not null default 20,
  walk_on_price  numeric(10,2) not null default 25,
  rental_price   numeric(10,2) not null default 35,
  banner       text default '',
  map_embed    text default '',
  published    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Event extras (per event add-ons like BBs, pyro)
create table public.event_extras (
  id       uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  name     text not null,
  price    numeric(10,2) not null default 0,
  no_post  boolean not null default false,
  sort_order integer default 0
);

-- Bookings
create table public.bookings (
  id          uuid primary key default uuid_generate_v4(),
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  user_name   text not null,
  ticket_type text not null check (ticket_type in ('walkOn','rental')),
  qty         integer not null default 1,
  extras      jsonb default '{}',
  total       numeric(10,2) not null default 0,
  checked_in  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Shop products
create table public.shop_products (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  description text default '',
  price       numeric(10,2) not null default 0,
  sale_price  numeric(10,2),
  on_sale     boolean not null default false,
  image       text default '',
  stock       integer not null default 0,
  no_post     boolean not null default false,
  sort_order  integer default 0,
  created_at  timestamptz not null default now()
);

-- Postage options
create table public.postage_options (
  id    uuid primary key default uuid_generate_v4(),
  name  text not null,
  price numeric(10,2) not null default 0,
  sort_order integer default 0
);

-- Gallery albums
create table public.gallery_albums (
  id         uuid primary key default uuid_generate_v4(),
  title      text not null,
  sort_order integer default 0,
  created_at timestamptz not null default now()
);

-- Gallery images
create table public.gallery_images (
  id       uuid primary key default uuid_generate_v4(),
  album_id uuid not null references public.gallery_albums(id) on delete cascade,
  url      text not null,
  sort_order integer default 0,
  created_at timestamptz not null default now()
);

-- Q&A
create table public.qa_items (
  id         uuid primary key default uuid_generate_v4(),
  question   text not null,
  answer     text not null,
  sort_order integer default 0,
  created_at timestamptz not null default now()
);

-- Site settings (key/value store for things like home message)
create table public.site_settings (
  key   text primary key,
  value text not null default ''
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles         enable row level security;
alter table public.events            enable row level security;
alter table public.event_extras      enable row level security;
alter table public.bookings          enable row level security;
alter table public.shop_products     enable row level security;
alter table public.postage_options   enable row level security;
alter table public.gallery_albums    enable row level security;
alter table public.gallery_images    enable row level security;
alter table public.qa_items          enable row level security;
alter table public.site_settings     enable row level security;

-- Helper: is current user admin or staff?
create or replace function public.is_admin_or_staff()
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','staff')
  );
$$;

-- Helper: is current user admin?
create or replace function public.is_admin()
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- PROFILES
create policy "Users can view their own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Admins can view all profiles"
  on public.profiles for select using (public.is_admin_or_staff());
create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);
create policy "Admins can update any profile"
  on public.profiles for update using (public.is_admin_or_staff());
create policy "Admins can delete profiles"
  on public.profiles for delete using (public.is_admin());

-- EVENTS (public read, admin write)
create policy "Anyone can view published events"
  on public.events for select using (published = true or public.is_admin_or_staff());
create policy "Admins can manage events"
  on public.events for all using (public.is_admin_or_staff());

-- EVENT EXTRAS
create policy "Anyone can view extras"
  on public.event_extras for select using (true);
create policy "Admins can manage extras"
  on public.event_extras for all using (public.is_admin_or_staff());

-- BOOKINGS
create policy "Users can view their own bookings"
  on public.bookings for select using (auth.uid() = user_id);
create policy "Admins can view all bookings"
  on public.bookings for select using (public.is_admin_or_staff());
create policy "Logged-in users can create bookings"
  on public.bookings for insert with check (auth.uid() = user_id);
create policy "Admins can update bookings (check-in)"
  on public.bookings for update using (public.is_admin_or_staff());
create policy "Admins can delete bookings"
  on public.bookings for delete using (public.is_admin_or_staff());

-- SHOP (public read, admin write)
create policy "Anyone can view shop products"
  on public.shop_products for select using (true);
create policy "Admins can manage shop"
  on public.shop_products for all using (public.is_admin_or_staff());

-- POSTAGE
create policy "Anyone can view postage options"
  on public.postage_options for select using (true);
create policy "Admins can manage postage"
  on public.postage_options for all using (public.is_admin_or_staff());

-- GALLERY
create policy "Anyone can view gallery"
  on public.gallery_albums for select using (true);
create policy "Admins can manage albums"
  on public.gallery_albums for all using (public.is_admin_or_staff());
create policy "Anyone can view gallery images"
  on public.gallery_images for select using (true);
create policy "Admins can manage images"
  on public.gallery_images for all using (public.is_admin_or_staff());

-- Q&A
create policy "Anyone can view Q&A"
  on public.qa_items for select using (true);
create policy "Admins can manage Q&A"
  on public.qa_items for all using (public.is_admin_or_staff());

-- SITE SETTINGS
create policy "Anyone can view settings"
  on public.site_settings for select using (true);
create policy "Admins can manage settings"
  on public.site_settings for all using (public.is_admin_or_staff());

-- ============================================================
-- TRIGGER: Auto-create profile on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- SEED DATA
-- ============================================================

-- Site settings
insert into public.site_settings (key, value) values
  ('home_message', '🎯 Welcome to Swindon Airsoft! Book your next game day now.');

-- Postage options
insert into public.postage_options (name, price, sort_order) values
  ('Standard (3-5 days)', 3.99, 1),
  ('Express (1-2 days)',  7.99, 2),
  ('Collection (free)',   0.00, 3);

-- Shop products
insert into public.shop_products (name, description, price, sale_price, on_sale, stock, no_post, sort_order) values
  ('M4 AEG Rifle',      'Full metal M4 AEG — perfect starter rifle', 180.00, null,  false, 5,  false, 1),
  ('Desert Eagle GBB',  'Gas blowback pistol, great sidearm',        95.00,  80.00, true,  8,  false, 2),
  ('BBs 5000 0.2g',     'High quality 0.2g biodegradable BBs',       12.00,  null,  false, 50, false, 3),
  ('Smoke Grenade',     'Airsoft smoke — collection only',            6.00,   null,  false, 20, true,  4);

-- Events
insert into public.events (title, date, time, location, description, walk_on_slots, rental_slots, walk_on_price, rental_price, published) values
  ('Operation Nightfall', '2026-04-12', '09:00', 'Swindon Woodland Site, SN1 2AB',
   'Full day skirmish with night ops from 6pm. Bring your best camo!', 40, 20, 25, 35, true),
  ('Urban Assault', '2026-05-03', '09:00', 'CQB Arena, Swindon SN4 5HJ',
   'Close-quarters battle in our brand new urban environment.', 30, 15, 25, 35, true);

-- Event extras (linked to events above)
insert into public.event_extras (event_id, name, price, no_post, sort_order)
select e.id, x.name, x.price, x.no_post, x.sort_order
from public.events e
cross join (values
  ('BBs (1000)',   5.00, false, 1),
  ('Smoke Grenade',3.00, false, 2),
  ('Pyro Pack',    8.00, true,  3)
) as x(name, price, no_post, sort_order);

-- Gallery
insert into public.gallery_albums (title, sort_order) values
  ('Operation Nightfall 2024', 1),
  ('CQB Summer 2024', 2);

-- Q&A
insert into public.qa_items (question, answer, sort_order) values
  ('What should I wear?',       'Wear comfortable, dark or camouflage clothing. No military uniforms that could be mistaken for real forces.', 1),
  ('What age can players be?',  'Players aged 12+ can attend with a parent/guardian signed waiver. 18+ can play independently.', 2),
  ('Do I need my own gun?',     'No! We offer rental packages including gun, BBs and protective gear.', 3),
  ('Is it safe?',               'Yes. All players must wear approved eye protection at all times in the safe zone and game area.', 4);
