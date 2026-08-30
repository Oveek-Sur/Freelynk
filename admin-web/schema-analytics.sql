-- ===============================================================
-- FreeLynk — usage counting
--
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- WHAT THIS CAN AND CANNOT TELL YOU
--
-- It counts devices that have opened the app and reached the server.
-- That is not the same as Play Store downloads: someone who installs
-- and never opens it is never counted, and a factory reset or a
-- reinstall with cleared data looks like a new device. Play Console
-- remains the authority on downloads. What this gives instead — how
-- many people actually USE the app, daily and monthly — is the number
-- that matters more.
--
-- WHY IT IS SHAPED LIKE THIS
--
-- The obvious design keeps one row per device per day it was used.
-- That is simple, and it does not scale: at six hundred thousand daily
-- users it writes 600k rows a day, which is tens of millions of rows
-- and several gigabytes within a quarter. The counting would collapse
-- long before the app itself did.
--
-- So the history is kept as ONE ROW PER DAY holding a count, and the
-- per-device state lives in a single row per install that is updated
-- in place. Storage then grows with the number of installs, not with
-- installs x days:
--
--     600,000 daily users  ->  ~60 MB total, and one row per day
--     the same design at   ->  ~4 GB and 54 million rows
--     one row per day each
--
-- Accuracy is unchanged. Because the app reports at most once per
-- calendar day, "last_seen is today" is exactly equivalent to "active
-- today", so daily and monthly figures are still counted, not sampled
-- or estimated.
--
-- PRIVACY
--
-- The device id is a random UUID the app generates for itself. No
-- account, no phone number, no advertising id, no location. There is
-- nothing here that identifies a person, which is deliberate: the app
-- asks for no login, so it has no business knowing who anyone is.
-- ===============================================================

-- One row per install that has ever contacted us. Updated in place.
create table if not exists public.app_devices (
  id           uuid        primary key,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  platform     text        not null default 'android',
  app_version  text
);

create index if not exists app_devices_last_seen_idx on public.app_devices (last_seen desc);
create index if not exists app_devices_first_seen_idx on public.app_devices (first_seen desc);

-- One row per DAY, for the chart. Not one per device per day.
create table if not exists public.app_daily (
  day          date    primary key,
  active       integer not null default 0,
  new_devices  integer not null default 0
);

-- The earlier per-device-per-day table, if this file was run before it
-- was replaced. Dropping it is the whole point of the change.
drop table if exists public.app_activity;

-- ===============================================================
-- ROW LEVEL SECURITY
--
-- Same stance as every other table here: on, with no policies, so anon
-- and authenticated can read nothing at all. Only the service_role key
-- — server side, in Vercel's environment — ever touches these rows.
-- ===============================================================
alter table public.app_devices enable row level security;
alter table public.app_daily   enable row level security;

revoke all on public.app_devices from anon, authenticated;
revoke all on public.app_daily   from anon, authenticated;

-- ===============================================================
-- RECORDING A VISIT
--
-- One statement from the API, so a launch costs a single round trip.
--
-- The daily counter is only incremented when a device is seen for the
-- first time that day, which is what keeps it a count of people rather
-- than a count of requests. `for update` on the existing row makes that
-- decision safe if the same device somehow reports twice at once.
--
-- Days are Asia/Dhaka, not UTC. In UTC, "today" would roll over at six
-- in the morning and every daily figure would be wrong for the people
-- actually using this.
-- ===============================================================
create or replace function public.record_device(
  p_id       uuid,
  p_platform text default 'android',
  p_version  text default null
)
returns void
language plpgsql
as $$
declare
  v_today    date := (now() at time zone 'Asia/Dhaka')::date;
  v_prev_day date;
  v_existed  boolean;
begin
  select (last_seen at time zone 'Asia/Dhaka')::date
    into v_prev_day
  from public.app_devices
  where id = p_id
  for update;

  v_existed := found;

  if v_existed then
    update public.app_devices
       set last_seen   = now(),
           platform    = coalesce(p_platform, platform),
           app_version = coalesce(p_version, app_version)
     where id = p_id;
  else
    insert into public.app_devices (id, platform, app_version)
    values (p_id, coalesce(p_platform, 'android'), p_version)
    on conflict (id) do update set last_seen = now();
  end if;

  -- Already counted today? Then there is nothing more to do.
  if v_existed and v_prev_day = v_today then
    return;
  end if;

  insert into public.app_daily (day, active, new_devices)
  values (v_today, 1, case when v_existed then 0 else 1 end)
  on conflict (day) do update
    set active      = public.app_daily.active + 1,
        new_devices = public.app_daily.new_devices
                      + case when v_existed then 0 else 1 end;
end;
$$;

revoke all on function public.record_device(uuid, text, text) from anon, authenticated;

-- ===============================================================
-- THE DASHBOARD FIGURES
--
-- One function so the admin page makes a single round trip and the
-- counting rules live in one place.
--
-- Daily and monthly active counts come from app_devices.last_seen,
-- which is exact: the app reports at most once a calendar day, so a
-- device whose last_seen falls inside the window was active in it.
-- app_daily supplies the history, which last_seen cannot, because it
-- is overwritten.
-- ===============================================================
create or replace function public.app_stats()
returns json
language sql
stable
as $$
  with today as (select (now() at time zone 'Asia/Dhaka')::date as d)
  select json_build_object(
    'totalDevices', (select count(*) from public.app_devices),

    'newToday', (
      select coalesce(new_devices, 0) from public.app_daily
      where day = (select d from today)
    ),
    'newThisMonth', (
      select coalesce(sum(new_devices), 0) from public.app_daily
      where day > (select d from today) - 30
    ),

    'dau', (
      select count(*) from public.app_devices
      where (last_seen at time zone 'Asia/Dhaka')::date = (select d from today)
    ),
    'wau', (
      select count(*) from public.app_devices
      where (last_seen at time zone 'Asia/Dhaka')::date > (select d from today) - 7
    ),
    'mau', (
      select count(*) from public.app_devices
      where (last_seen at time zone 'Asia/Dhaka')::date > (select d from today) - 30
    ),

    -- Last 30 days, oldest first. Idle days are simply absent; the UI
    -- fills the gaps rather than the database storing empty rows.
    'daily', (
      select coalesce(json_agg(json_build_object('day', day, 'active', active)
                               order by day), '[]'::json)
      from public.app_daily
      where day > (select d from today) - 30
    )
  );
$$;

revoke all on function public.app_stats() from anon, authenticated;

-- ===============================================================
-- HOUSEKEEPING
--
-- app_daily gains one row a day — 365 a year — so it never needs
-- pruning. app_devices holds one row per install and grows only with
-- real installs; roughly 100 bytes each, so a million installs is
-- about 100 MB.
--
-- Installs that have not opened the app in a year are dead weight and
-- are in no figure the dashboard shows. Optional:
--
--   select cron.schedule('freelynk-prune', '0 3 * * *',
--     $$select public.prune_dead_devices()$$);
-- ===============================================================
create or replace function public.prune_dead_devices()
returns integer
language plpgsql
as $$
declare
  removed integer;
begin
  delete from public.app_devices where last_seen < now() - interval '365 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_dead_devices() from anon, authenticated;
