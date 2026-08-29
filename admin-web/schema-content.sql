-- ===============================================================
-- FreeLynk — banners & partner shops
-- Run this once in Supabase → SQL Editor (after schema.sql).
-- ===============================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- Banners shown at the top of the app.
-- Turning every row off (or deleting them) hides the banner area
-- completely — the app renders nothing at all.
-- ---------------------------------------------------------------
create table if not exists public.banners (
  id          uuid primary key default gen_random_uuid(),
  title       text        not null default '',
  image_url   text        not null,
  link_url    text        not null default '',
  is_active   boolean     not null default true,
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists banners_active_order_idx
  on public.banners (is_active, sort_order asc, created_at desc);

-- ---------------------------------------------------------------
-- Partner shops.
-- ---------------------------------------------------------------
create table if not exists public.shops (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  image_url   text        not null default '',
  sells       text        not null default '',   -- what they sell
  address     text        not null default '',
  phone       text        not null default '',
  is_active   boolean     not null default true,
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists shops_active_order_idx
  on public.shops (is_active, sort_order asc, name asc);

-- keep updated_at fresh (function already exists from schema.sql,
-- recreated here so this file can run standalone)
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists banners_touch_updated_at on public.banners;
create trigger banners_touch_updated_at
  before update on public.banners
  for each row execute function public.touch_updated_at();

drop trigger if exists shops_touch_updated_at on public.shops;
create trigger shops_touch_updated_at
  before update on public.shops
  for each row execute function public.touch_updated_at();

-- ===============================================================
-- ROW LEVEL SECURITY
--
-- Same stance as public.networks: RLS on, no policies, so anon and
-- authenticated can read nothing. Only the service_role key (server
-- side, in Vercel env vars) reaches these tables.
--
-- The app gets this data through /api/content, not from Supabase.
-- ===============================================================
alter table public.banners enable row level security;
alter table public.shops   enable row level security;

revoke all on public.banners from anon, authenticated;
revoke all on public.shops   from anon, authenticated;

-- ===============================================================
-- STORAGE
--
-- Images are genuinely public — they are advertising. The bucket is
-- public so <Image src> works with no signed URLs and no key in the
-- APK. Uploads still go through /api/upload, which requires an admin
-- session, so the public flag only grants READ.
-- ===============================================================
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;
