-- ===========================================================================
-- Native push: one row per device token (APNs, iOS app).
--
-- Keyed by token because a phone belongs to whoever is signed in on it now:
-- when user B logs in on a phone A used, the same token must move to B. Under
-- RLS B cannot update A's row, so writes go through register_push_device(), a
-- security-definer upsert that re-homes the token to auth.uid() (STANDARDS
-- rule 3: an atomic check-then-write that must bypass RLS with validation).
-- Clients may only read and delete their own rows; delete is what logout
-- uses, and it correctly does nothing if the token has since been re-homed.
--
-- deleteAccount removes a user's devices explicitly: profiles are anonymised,
-- never deleted, so the FK cascade never fires. The sender deletes tokens APNs
-- reports dead (410 Unregistered / 400 BadDeviceToken). last_seen_at is
-- refreshed on every registration so a later cron can prune stale rows.
-- ===========================================================================
create table if not exists public.push_devices (
  token         text primary key check (token ~ '^[0-9a-f]{32,255}$'),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  platform      text not null default 'ios' check (platform in ('ios')),
  app_version   text check (app_version is null or char_length(app_version) <= 40),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create index if not exists push_devices_user_idx on public.push_devices (user_id);

alter table public.push_devices enable row level security;
-- Some Supabase images carry default privileges that grant new tables to
-- anon/authenticated; revoke explicitly, then grant only what clients need.
revoke all on public.push_devices from anon, authenticated;
grant all on public.push_devices to service_role;
grant select, delete on public.push_devices to authenticated;

create policy push_devices_select_own on public.push_devices
  for select to authenticated using (user_id = auth.uid());
create policy push_devices_delete_own on public.push_devices
  for delete to authenticated using (user_id = auth.uid());

-- Upsert that re-homes a token to whoever is signed in on the phone now.
create or replace function public.register_push_device(
  p_token text, p_platform text default 'ios', p_app_version text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_token text := lower(trim(coalesce(p_token, '')));
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  if v_token !~ '^[0-9a-f]{32,255}$' then
    raise exception 'Invalid device token';
  end if;
  if p_platform is distinct from 'ios' then
    raise exception 'Unsupported platform';
  end if;
  insert into public.push_devices (token, user_id, platform, app_version)
  values (v_token, auth.uid(), p_platform, left(p_app_version, 40))
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        app_version = excluded.app_version,
        last_seen_at = now();
end $$;

revoke execute on function public.register_push_device(text, text, text) from public, anon;
grant execute on function public.register_push_device(text, text, text) to authenticated, service_role;
