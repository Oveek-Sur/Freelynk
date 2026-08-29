-- ===============================================================
-- FreeLynk — usage counting
--
-- Run once in the Supabase SQL editor.
--
-- WHAT THIS CAN AND CANNOT TELL YOU
--
-- It counts devices that have opened the app and reached the server.
-- That is not the same as Play Store downloads: someone who installs
-- and never opens it is never counted, and a factory reset or a
-- reinstall with cleared data looks like a new device. Play Console
-- remains the authority on downloads. What this gives you — how many
-- people actually USE the app, daily and monthly — is the number that
-- matters more, and Play Console reports it only coarsely.
--
-- PRIVACY
--
-- The device id is a random UUID the app generates for itself. No
-- account, no phone number, no advertising id, no location. There is
-- nothing here that identifies a person, which is deliberate: the app
-- asks for no login, so it has no business knowing who anyone is.
-- ===============================================================

-- One row per install that has ever contacted us.
create table if not exists public.app_devices (
  id           uuid        primary key,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  platform     text        not null default 'android',
  app_version  text
);

create index if not exists app_devices_last_seen_idx on public.app_devices (last_seen desc);
create index if not exists app_devices_first_seen_idx on public.app_devices (first_seen desc);

-- One row per device per day it was used.
--
-- app_devices.last_seen alone would give today's active count but would
-- lose every previous day the moment it is overwritten, so there would
-- be no history to plot and no honest monthly figure. This keeps the
-- day, and nothing else.
create table if not exists public.app_activity (
  device_id uuid not null references public.app_devices (id) on delete cascade,
  day       date not null,
  primary key (device_id, day)
);

create index if not exists app_activity_day_idx on public.app_activity (day desc);

-- ===============================================================
-- ROW LEVEL SECURITY
--
-- Same stance as every other table here: on, with no policies, so anon
-- and authenticated can read nothing at all. Only the service_role key
-- — server side, in Vercel's environment — ever touches these rows.
-- ===============================================================
alter table public.app_devices  enable row level security;
alter table public.app_activity enable row level security;

revoke all on public.app_devices  from anon, authenticated;
revoke all on public.app_activity from anon, authenticated;

-- ===============================================================
-- THE DASHBOARD FIGURES
--
-- One function so the admin page makes a single round trip instead of
-- six, and so the counting rules live in one place.
--
-- Days are Asia/Dhaka, not UTC. With UTC, "today" would roll over at
-- 6am local time and every daily number would be wrong for the people
-- actually using this.
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
      select count(*) from public.app_devices
      where (first_seen at time zone 'Asia/Dhaka')::date = (select d from today)
    ),
    'newThisMonth', (
      select count(*) from public.app_devices
      where (first_seen at time zone 'Asia/Dhaka')::date
            > (select d from today) - 30
    ),

    'dau', (
      select count(*) from public.app_activity
      where day = (select d from today)
    ),
    'wau', (
      select count(distinct device_id) from public.app_activity
      where day > (select d from today) - 7
    ),
    'mau', (
      select count(distinct device_id) from public.app_activity
      where day > (select d from today) - 30
    ),

    -- Last 30 days, oldest first, for the chart. Days with no use are
    -- simply absent; the UI fills the gaps rather than the database
    -- storing a row per device per idle day.
    'daily', (
      select coalesce(json_agg(json_build_object('day', day, 'active', active)
                               order by day), '[]'::json)
      from (
        select day, count(*)::int as active
        from public.app_activity
        where day > (select d from today) - 30
        group by day
      ) t
    )
  );
$$;

revoke all on function public.app_stats() from anon, authenticated;

-- ===============================================================
-- HOUSEKEEPING
--
-- app_activity grows by one row per active device per day. At a
-- hundred thousand daily users that is three million rows a month,
-- which will outgrow a free Supabase project. The stats only ever look
-- back 30 days, so anything older is dead weight.
--
-- Run this occasionally, or schedule it with pg_cron:
--
--   select cron.schedule('freelynk-prune', '0 3 * * *',
--     $$select public.prune_app_activity()$$);
-- ===============================================================
create or replace function public.prune_app_activity()
returns integer
language plpgsql
as $$
declare
  removed integer;
begin
  delete from public.app_activity
  where day < (now() at time zone 'Asia/Dhaka')::date - 90;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_app_activity() from anon, authenticated;
