-- ===========================================================================
-- Door lists: standalone check-in lists imported from a Partiful guest CSV.
--
-- Not tied to a DoorMan event: a list is names (plus the Partiful RSVP status,
-- contact details, and each guest's plus-ones as their own rows) that door
-- staff search and check in. Rows live in the database so every phone on the
-- list sees check-ins and additions live.
--
-- Who can do what:
--   * Creating lists is limited to allow-listed accounts (can_use_door_lists;
--     keep in sync with DOOR_LIST_EMAILS in src/lib/featureAccess.js).
--   * The owner invites people by email (inviteDoorListMember edge function).
--     Members can read the list, add guests and check them in; only the owner
--     can rename/delete the list or manage who's on it.
-- ===========================================================================

create or replace function public.can_use_door_lists() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and email in ('soooomuchcoffee@gmail.com')
  );
$$;

create table public.door_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  source text not null default 'partiful',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index door_lists_owner_idx on public.door_lists (owner_id);
create trigger door_lists_updated_at before update on public.door_lists
  for each row execute function public.set_updated_at();

create table public.door_list_members (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.door_lists(id) on delete cascade,
  email citext not null,
  -- Filled when the invitee already has an account; otherwise access is by
  -- the signed-in email, so an invite works the moment they sign up.
  user_id uuid references public.profiles(id) on delete cascade,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (list_id, email)
);
create index door_list_members_list_idx on public.door_list_members (list_id);
create index door_list_members_user_idx on public.door_list_members (user_id);
create index door_list_members_email_idx on public.door_list_members (email);

create table public.door_list_guests (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.door_lists(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  status text,          -- Partiful RSVP status as exported ("Going", "Maybe", ...)
  plus_ones integer not null default 0 check (plus_ones between 0 and 50),
  -- A plus-one is its own row (checked in on its own) pointing at its host.
  plus_one_of uuid references public.door_list_guests(id) on delete cascade,
  phone text,
  email citext,
  note text,
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index door_list_guests_list_idx on public.door_list_guests (list_id);
create index door_list_guests_plus_one_idx on public.door_list_guests (plus_one_of);
create trigger door_list_guests_updated_at before update on public.door_list_guests
  for each row execute function public.set_updated_at();

-- Security definer so the policies below can consult other tables without
-- recursing through their own RLS.
create or replace function public.is_door_list_owner(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_use_door_lists() and exists (
    select 1 from door_lists where id = lid and owner_id = auth.uid());
$$;

create or replace function public.can_access_door_list(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_door_list_owner(lid) or exists (
    select 1 from door_list_members m
    where m.list_id = lid
      and (m.user_id = auth.uid() or m.email = public.current_email()));
$$;

revoke execute on function public.can_use_door_lists() from public, anon;
revoke execute on function public.is_door_list_owner(uuid) from public, anon;
revoke execute on function public.can_access_door_list(uuid) from public, anon;
grant execute on function public.can_use_door_lists() to authenticated, service_role;
grant execute on function public.is_door_list_owner(uuid) to authenticated, service_role;
grant execute on function public.can_access_door_list(uuid) to authenticated, service_role;

alter table public.door_lists enable row level security;
alter table public.door_list_members enable row level security;
alter table public.door_list_guests enable row level security;

-- Lists: owner and members read; only an allow-listed owner creates, renames
-- or deletes.
-- owner_id is checked directly as well: INSERT ... RETURNING evaluates this
-- policy against the new row, which can_access_door_list's own lookup can't
-- see yet within the same statement.
create policy door_lists_select on public.door_lists
  for select to authenticated
  using (owner_id = auth.uid() or public.can_access_door_list(id));
create policy door_lists_insert on public.door_lists
  for insert to authenticated
  with check (owner_id = auth.uid() and public.can_use_door_lists());
create policy door_lists_update on public.door_lists
  for update to authenticated
  using (public.is_door_list_owner(id)) with check (public.is_door_list_owner(id));
create policy door_lists_delete on public.door_lists
  for delete to authenticated using (public.is_door_list_owner(id));

-- Members: everyone on the list can see who else is; only the owner adds or
-- removes people (inviting normally goes through inviteDoorListMember, which
-- also emails them).
create policy door_list_members_select on public.door_list_members
  for select to authenticated using (public.can_access_door_list(list_id));
create policy door_list_members_insert on public.door_list_members
  for insert to authenticated with check (public.is_door_list_owner(list_id));
create policy door_list_members_delete on public.door_list_members
  for delete to authenticated using (public.is_door_list_owner(list_id));

-- Guests: anyone with access reads, adds, edits, checks in and removes.
create policy door_list_guests_all on public.door_list_guests
  for all to authenticated
  using (public.can_access_door_list(list_id))
  with check (public.can_access_door_list(list_id));

revoke all on public.door_lists, public.door_list_members, public.door_list_guests from anon, authenticated;
grant select, insert, update, delete on public.door_lists, public.door_list_guests to authenticated;
grant select, insert, delete on public.door_list_members to authenticated;
grant all on public.door_lists, public.door_list_members, public.door_list_guests to service_role;

-- Check a guest in (or undo). Atomic so two phones tapping the same name at
-- once can't both "win": the second learns the guest was already checked in.
-- Security invoker, so the RLS above still decides who may touch the row.
create or replace function public.door_list_set_checkin(p_guest_id uuid, p_checked_in boolean)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_prev timestamptz;
  v_new timestamptz;
begin
  select g.checked_in_at into v_prev
  from door_list_guests g where g.id = p_guest_id
  for update;
  if not found then
    raise exception 'Guest not found' using errcode = 'P0002';
  end if;

  if p_checked_in then
    if v_prev is not null then
      return jsonb_build_object('checked_in_at', v_prev, 'already', true);
    end if;
    update door_list_guests
      set checked_in_at = now(), checked_in_by = auth.uid()
      where id = p_guest_id
      returning door_list_guests.checked_in_at into v_new;
    return jsonb_build_object('checked_in_at', v_new, 'already', false);
  end if;

  update door_list_guests
    set checked_in_at = null, checked_in_by = null
    where id = p_guest_id;
  return jsonb_build_object('checked_in_at', null, 'already', false);
end $$;
revoke execute on function public.door_list_set_checkin(uuid, boolean) from public, anon;
grant execute on function public.door_list_set_checkin(uuid, boolean) to authenticated, service_role;

-- Live check-ins and additions across phones.
alter publication supabase_realtime add table public.door_list_guests;
