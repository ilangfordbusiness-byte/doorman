-- ===========================================================================
-- DJ lineup + DJ (performer) profiles.
--  * Adds performer fields to profiles (bio, booking_email, music_link, genres)
--    — self-editable and world-readable, like snapchat/location.
--  * event_dj_lineup: an ordered list of DJs on an event (each a display name +
--    optional link to a DoorMan account + a free-text set time), modelled on
--    event_co_hosts so the client can sync the array directly (RLS gated by
--    is_event_manager — host, co-hosts, business managers).
-- ===========================================================================

-- 1. Performer fields on profiles -------------------------------------------
alter table public.profiles
  add column if not exists bio text,
  add column if not exists booking_email text,
  add column if not exists music_link text,
  add column if not exists genres text;

alter table public.profiles drop constraint if exists profiles_bio_length;
alter table public.profiles add constraint profiles_bio_length
  check (bio is null or char_length(bio) <= 300);

-- Additive column grants (mirror snapchat/location): readable + self-editable.
grant select (bio, booking_email, music_link, genres) on public.profiles to authenticated;
grant update (bio, booking_email, music_link, genres) on public.profiles to authenticated;

-- 2. event_dj_lineup ---------------------------------------------------------
create table if not exists public.event_dj_lineup (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  dj_user_id uuid references public.profiles(id) on delete set null,
  dj_name text not null,
  set_time text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists event_dj_lineup_event_idx on public.event_dj_lineup (event_id);
create index if not exists event_dj_lineup_dj_idx on public.event_dj_lineup (dj_user_id);

alter table public.event_dj_lineup enable row level security;

-- A lineup is public info shown on the event page → readable by any signed-in
-- user. Only event managers (host / accepted co-hosts / business managers) may
-- write it — the same gate co-hosts use, so the browser can sync directly.
create policy dj_lineup_select on public.event_dj_lineup
  for select to authenticated using (true);
create policy dj_lineup_insert on public.event_dj_lineup
  for insert to authenticated with check (public.is_event_manager(event_id));
create policy dj_lineup_update on public.event_dj_lineup
  for update to authenticated
  using (public.is_event_manager(event_id)) with check (public.is_event_manager(event_id));
create policy dj_lineup_delete on public.event_dj_lineup
  for delete to authenticated using (public.is_event_manager(event_id));

grant select, insert, update, delete on public.event_dj_lineup to authenticated;
