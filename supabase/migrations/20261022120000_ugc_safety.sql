-- ===========================================================================
-- Content reports and user blocks (App Store Guideline 1.2, user-generated
-- content). Users see content that other users wrote: events, host and
-- business profiles, and host chat messages. They must be able to report it
-- and to block the person who wrote it.
--
-- content_reports: one row per report. The reportContent edge function
-- inserts it with the service role (it validates the target, copies the
-- message text so a deleted message can still be reviewed, and emails the
-- moderation inbox). Clients never insert directly. Admins read the list and
-- set its status from the Admin page.
--
-- user_blocks: one row per (blocker, blocked) pair, owned by the blocker.
-- The data layer hides a blocked user's events, chat messages and profile
-- from the blocker. The database stops a blocked pair from sending friend
-- requests in either direction.
-- ===========================================================================
create table if not exists public.content_reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.profiles(id) on delete cascade,
  target_type      text not null check (target_type in ('event', 'message', 'user')),
  event_id         uuid references public.events(id) on delete set null,
  message_id       uuid references public.event_messages(id) on delete set null,
  reported_user_id uuid references public.profiles(id) on delete set null,
  message_text     text,
  reason           text not null check (reason in
                     ('spam', 'harassment', 'hate', 'sexual', 'violence', 'scam', 'other')),
  details          text check (char_length(details) <= 1000),
  status           text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  resolved_by      uuid references public.profiles(id) on delete set null
);
create index if not exists content_reports_status_idx
  on public.content_reports (status, created_at desc);

alter table public.content_reports enable row level security;
revoke all on public.content_reports from anon, authenticated;
grant all on public.content_reports to service_role;
grant select on public.content_reports to authenticated;
grant update (status, resolved_at, resolved_by) on public.content_reports to authenticated;

create policy content_reports_admin_select on public.content_reports
  for select to authenticated using (public.is_admin());
create policy content_reports_admin_update on public.content_reports
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create table if not exists public.user_blocks (
  blocker_id  uuid not null references public.profiles(id) on delete cascade,
  blocked_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from anon, authenticated;
grant all on public.user_blocks to service_role;
grant select, insert, delete on public.user_blocks to authenticated;

create policy user_blocks_select_own on public.user_blocks
  for select to authenticated using (blocker_id = auth.uid());
create policy user_blocks_insert_own on public.user_blocks
  for insert to authenticated with check (blocker_id = auth.uid());
create policy user_blocks_delete_own on public.user_blocks
  for delete to authenticated using (blocker_id = auth.uid());

-- True when either user has blocked the other. Security definer because each
-- side may only read its own blocks.
create or replace function public.is_blocked_pair(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  )
$$;
revoke execute on function public.is_blocked_pair(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_pair(uuid, uuid) to authenticated, service_role;

-- Restrictive: applies together with friends_insert, so a blocked pair can
-- never open a friend request, whoever sends it.
create policy friends_insert_not_blocked on public.friend_requests
  as restrictive for insert to authenticated
  with check (not public.is_blocked_pair(sender_id, receiver_id));
