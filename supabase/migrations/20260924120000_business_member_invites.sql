-- ===========================================================================
-- Business members: owner-only management + email invitations.
--
-- Builds on 20260918120000_business_profiles_and_members.sql, which added
-- business_members (email citext + nullable user_id, like event_co_hosts).
--
--  * Only the business OWNER can invite, edit or remove members. Accepted
--    members keep full manager access to the business and its events but
--    cannot change who is on the team (previously any member could).
--  * Invites no longer require an existing DoorMan account: the signup
--    trigger back-links business_members.user_id by email, the same way it
--    does for co-hosts, staff and promoters. The inviteBusinessMember edge
--    function emails the invitee a link to /business/:id/invite.
--  * Closing a gap: events_insert only checked host_id = auth.uid(), so any
--    user could publish an event under someone else's business_id. It now
--    also requires the caller to be an owner or accepted member of that
--    business.
-- ===========================================================================

-- 1. Owner helper (security definer so it works inside RLS) ------------------
create or replace function public.is_business_owner(biz uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from business_accounts b where b.id = biz and b.owner_id = auth.uid()
  )
$$;

-- 2. business_members: owner-only writes ------------------------------------
-- Select is unchanged: any manager sees the team; an invitee sees their own
-- row (needed for the invite landing page). Accept/decline goes through the
-- acceptBusinessMember edge function (service role), so clients never need
-- update rights on someone else's row.
drop policy if exists business_members_insert on public.business_members;
create policy business_members_insert on public.business_members
  for insert to authenticated
  with check (public.is_business_owner(business_id));

drop policy if exists business_members_update on public.business_members;
create policy business_members_update on public.business_members
  for update to authenticated
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

drop policy if exists business_members_delete on public.business_members;
create policy business_members_delete on public.business_members
  for delete to authenticated
  using (public.is_business_owner(business_id));

-- 3. events: only a business's owner/members may create events under it -----
drop policy if exists events_insert on public.events;
create policy events_insert on public.events
  for insert to authenticated
  with check (
    host_id = auth.uid()
    and (business_id is null or public.is_business_manager(business_id))
  );

-- 4. Signup trigger: back-link pending business invites by email ------------
-- Body copied from 20260910120000_second_super_admin.sql with one line added.
create or replace function public.handle_new_user() returns trigger
security definer set search_path = public
language plpgsql as $$
begin
  -- Refuse to create a brand-new account from a Google identity. Existing
  -- Google users never reach here (no INSERT on sign-in), so they keep working.
  if new.raw_app_meta_data ->> 'provider' = 'google' then
    raise exception 'Google sign-up is disabled. Please sign up with email — Google can only be used to sign in to an existing account.'
      using errcode = 'P0001';
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, phone, instagram, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'instagram',
    case
      when new.email in ('ilangfordbusiness@gmail.com', 'akshay.irudayaraj@gmail.com') then 'admin'
      else 'user'
    end
  );

  update public.guestlist_entries set guest_user_id = new.id
    where guest_user_id is null and guest_email = new.email;
  update public.event_co_hosts set user_id = new.id
    where user_id is null and email = new.email;
  update public.event_staff set user_id = new.id
    where user_id is null and email = new.email;
  update public.promoters set user_id = new.id
    where user_id is null and email = new.email;
  update public.business_members set user_id = new.id
    where user_id is null and email = new.email;
  update public.ticket_orders set guest_user_id = new.id
    where guest_user_id is null and guest_email = new.email;
  update public.ticket_transfers set recipient_id = new.id
    where recipient_id is null and recipient_email = new.email;

  return new;
end $$;
