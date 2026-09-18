-- ===========================================================================
-- Public business/host profile pages + business co-managers.
--
--  * Adds description + instagram to business_accounts (shown on the public
--    page) and exposes them via the anon-readable business_public view.
--  * Adds a business_members join table so a business can be co-managed by
--    other DoorMan users (invited by email), modelled on event_co_hosts.
--  * is_business_manager() = owner OR accepted member. Members get FULL access
--    (owner-parity): they can read/edit the business, and — via an extended
--    is_event_manager() — manage all of the business's events.
--  * get_notifications() surfaces pending business invites.
-- ===========================================================================

-- 1. Public profile fields ---------------------------------------------------
alter table public.business_accounts add column if not exists description text;
alter table public.business_accounts add column if not exists instagram text;

create or replace view public.business_public as
  select id, business_name, business_picture_url, description, instagram
  from public.business_accounts;
grant select on public.business_public to authenticated, anon;

-- Owners/managers may edit these two new fields from the client.
grant update (description, instagram) on public.business_accounts to authenticated;

-- 2. Members table -----------------------------------------------------------
-- Invite keyed by email (citext); user_id backfilled on accept. A manager can
-- invite; the invitee reads + accepts their own row.
create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_accounts(id) on delete cascade,
  email citext not null,
  user_id uuid references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (business_id, email)
);
create index if not exists business_members_business_idx on public.business_members (business_id);
create index if not exists business_members_user_idx on public.business_members (user_id);

alter table public.business_members enable row level security;

-- 3. Manager helper (security definer so it can be used inside RLS) -----------
create or replace function public.is_business_manager(biz uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from business_accounts b where b.id = biz and b.owner_id = auth.uid()
  )
  or exists (
    select 1 from business_members m
    where m.business_id = biz and m.status = 'accepted'
      and (m.user_id = auth.uid() or m.email = public.current_email())
  )
$$;

-- 4. RLS: business_accounts now readable/editable by any manager -------------
drop policy if exists business_select on public.business_accounts;
create policy business_select on public.business_accounts
  for select to authenticated
  using (public.is_business_manager(id) or public.is_admin());

drop policy if exists business_update on public.business_accounts;
create policy business_update on public.business_accounts
  for update to authenticated
  using (public.is_business_manager(id)) with check (public.is_business_manager(id));
-- business_insert / business_delete stay owner-only (unchanged).

-- 5. RLS + grants: business_members -----------------------------------------
create policy business_members_select on public.business_members
  for select to authenticated
  using (public.is_business_manager(business_id)
         or user_id = auth.uid() or email = public.current_email());
create policy business_members_insert on public.business_members
  for insert to authenticated
  with check (public.is_business_manager(business_id));
create policy business_members_update on public.business_members
  for update to authenticated
  using (public.is_business_manager(business_id)
         or user_id = auth.uid() or email = public.current_email())
  with check (public.is_business_manager(business_id)
         or user_id = auth.uid() or email = public.current_email());
create policy business_members_delete on public.business_members
  for delete to authenticated using (public.is_business_manager(business_id));

grant select, insert, update, delete on public.business_members to authenticated;

-- 6. Extend event-manager rights to business managers -----------------------
create or replace function public.is_event_manager(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from events e where e.id = eid and e.host_id = auth.uid()
  )
  or exists (
    select 1 from event_co_hosts c
    where c.event_id = eid and c.status = 'accepted'
      and (c.user_id = auth.uid() or c.email = public.current_email())
  )
  or exists (
    select 1 from events e
    where e.id = eid and e.business_id is not null
      and public.is_business_manager(e.business_id)
  )
  or public.is_admin()
$$;

-- 7. get_notifications: surface pending business invites --------------------
create or replace function public.get_notifications()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me profiles%rowtype;
  v_cohost jsonb;
  v_biz jsonb;
  v_friend_count int;
  v_invite_count int;
  v_transfer_count int;
begin
  select * into v_me from profiles where id = auth.uid();
  if not found then
    raise exception 'Unauthorized';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'event_id', e.id, 'title', e.title, 'date', e.date::text,
           'start_time', to_char(e.start_time, 'HH24:MI'),
           'host_name', coalesce(b.business_name, hp.full_name), 'host_email', hp.email,
           'host_picture', coalesce(b.business_picture_url, hp.avatar_url), 'cover_image', e.cover_image_url,
           'co_host_id', c.id)), '[]'::jsonb)
  into v_cohost
  from event_co_hosts c
  join events e on e.id = c.event_id
  join profiles hp on hp.id = e.host_id
  left join business_accounts b on b.id = e.business_id
  where c.status = 'pending'
    and (c.user_id = v_me.id or c.email = v_me.email);

  select coalesce(jsonb_agg(jsonb_build_object(
           'business_id', b.id, 'business_name', b.business_name,
           'business_picture', b.business_picture_url, 'member_id', m.id)), '[]'::jsonb)
  into v_biz
  from business_members m
  join business_accounts b on b.id = m.business_id
  where m.status = 'pending'
    and (m.user_id = v_me.id or m.email = v_me.email);

  select count(*) into v_friend_count
  from friend_requests where receiver_id = v_me.id and status = 'pending';

  select count(*) into v_invite_count
  from guestlist_entries
  where (guest_user_id = v_me.id or guest_email = v_me.email)
    and status = 'invited';

  select count(*) into v_transfer_count
  from ticket_transfers
  where status = 'pending'
    and (recipient_id = v_me.id or recipient_email = v_me.email);

  return jsonb_build_object(
    'coHostInvites', v_cohost,
    'businessInvites', v_biz,
    'counts', jsonb_build_object(
      'coHost', jsonb_array_length(v_cohost),
      'businessInvite', jsonb_array_length(v_biz),
      'friendRequests', v_friend_count,
      'eventInvites', v_invite_count,
      'transfers', v_transfer_count)
  );
end $$;
