-- ===========================================================================
-- App-wide settings, starting with the oldest iOS version allowed to run.
--
-- The iOS app reads ios_min_version when it opens and when it returns to the
-- foreground. A lower installed version shows a blocking "update" screen.
-- Raise it after a backend change that older builds cannot work with:
--   update public.app_config set ios_min_version = '1.2';
-- There is one row, readable with no session, and no client can write to it.
-- ===========================================================================

create table if not exists public.app_config (
  id              boolean primary key default true check (id),
  ios_min_version text not null default '1.0' check (ios_min_version ~ '^[0-9]+(\.[0-9]+)*$'),
  updated_at      timestamptz not null default now()
);

alter table public.app_config enable row level security;

revoke all on public.app_config from anon, authenticated;
grant all on public.app_config to service_role;
grant select on public.app_config to anon, authenticated;

create policy app_config_select on public.app_config
  for select to anon, authenticated
  using (true);

insert into public.app_config (id) values (true) on conflict (id) do nothing;
