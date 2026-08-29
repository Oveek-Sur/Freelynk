-- ===============================================================
-- ShareLynk — database schema
-- Run this once in Supabase → SQL Editor.
-- ===============================================================

create extension if not exists "pgcrypto";

create table if not exists public.networks (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  ssid        text        not null,
  password    text        not null default '',
  security    text        not null default 'WPA'
                check (security in ('WPA', 'WEP', 'OPEN')),
  area        text        not null default '',
  note        text        not null default '',
  priority    int         not null default 0,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per SSID (case-insensitive), so the app never sees duplicates.
create unique index if not exists networks_ssid_unique
  on public.networks (lower(btrim(ssid)));

create index if not exists networks_active_priority_idx
  on public.networks (is_active, priority desc, name asc);

-- keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists networks_touch_updated_at on public.networks;
create trigger networks_touch_updated_at
  before update on public.networks
  for each row execute function public.touch_updated_at();

-- ===============================================================
-- ROW LEVEL SECURITY
--
-- This is the fix for the old app's biggest hole: anyone holding the
-- anon key could `select password` straight out of the table.
--
-- Here RLS is ON and NO policy is created. That means anon and
-- authenticated roles can read/write NOTHING. Only the service_role
-- key (which bypasses RLS and lives only in Vercel env vars, never
-- in the phone) can touch this table.
--
-- The mobile app never talks to Supabase at all — it only calls
-- /api/sync, which returns an AES-256-GCM encrypted blob.
-- ===============================================================
alter table public.networks enable row level security;

revoke all on public.networks from anon, authenticated;

-- Optional seed row (delete if you don't want it)
-- insert into public.networks (name, ssid, password, area, note)
-- values ('Demo Cafe', 'DemoCafe_5G', 'demopassword', 'Mirpur', '2nd floor');
