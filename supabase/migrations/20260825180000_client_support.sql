-- Support objects for the frontend data layer.

-- Guestlist reads for the app go through this view: same row visibility as the
-- table's RLS (own entries, or staff of the event), but staff also see the
-- `notes` column, which the base table's column grants hide. qr_secret is
-- never exposed. security_invoker=off (default): executes as owner, so the
-- WHERE clause below is the access control.
create view public.guestlist_entries_view
with (security_barrier) as
  select g.id, g.event_id, g.guest_user_id, g.guest_email, g.guest_name,
         g.guest_phone, g.status, g.source, g.plus_one, g.plus_one_name,
         g.can_chat, g.checked_in_at, g.checked_in_by, g.checked_out_at,
         case when public.is_event_staff(g.event_id) then g.notes end as notes,
         g.created_by, g.created_at, g.updated_at
  from public.guestlist_entries g
  where g.guest_user_id = auth.uid()
     or g.guest_email = public.current_email()
     or public.is_event_staff(g.event_id);

grant select on public.guestlist_entries_view to authenticated;

-- Public event lookup by invite code (the invite landing page): validates the
-- code server-side and returns only the public shape, so invite_code itself
-- stays unreadable. Anyone with the link may view the event it points to.
create or replace function public.get_event_by_invite(p_invite_code text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_event events%rowtype;
begin
  select * into v_event from events
    where invite_code = p_invite_code and status <> 'draft';
  if not found then
    return null;
  end if;
  return public.event_public_json(v_event)
    || jsonb_build_object('invite_code', p_invite_code);
end $$;

grant execute on function public.get_event_by_invite(text) to anon, authenticated;

-- Transfers: the app lets the recipient decline and the sender cancel directly
-- (initiate/accept stay edge-function-only since they move the ticket). Only
-- the status and cancelled_at columns are writable, and a pending transfer can
-- only move to declined (recipient) or cancelled (sender).
create policy transfers_update_close on public.ticket_transfers
  for update to authenticated
  using (status = 'pending'
         and (sender_id = auth.uid()
              or recipient_id = auth.uid()
              or recipient_email = public.current_email()))
  with check (
    (status = 'declined' and (recipient_id = auth.uid() or recipient_email = public.current_email()))
    or (status = 'cancelled' and sender_id = auth.uid())
  );

grant update (status, cancelled_at) on public.ticket_transfers to authenticated;

-- Join a PUBLIC published event directly (the old app auto-approved these
-- client-side, which RLS now forbids). Reuses an existing row if present.
create or replace function public.join_public_event(p_event_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_email citext := public.current_email();
  v_entry_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to join this event';
  end if;
  if not exists (
    select 1 from events
    where id = p_event_id and status = 'published' and is_public and requests_open
  ) then
    raise exception 'This event is not open to join';
  end if;
  select id into v_entry_id from guestlist_entries
    where event_id = p_event_id
      and (guest_user_id = auth.uid() or guest_email = v_email)
    order by created_at desc limit 1;
  if v_entry_id is not null then
    update guestlist_entries set status = 'approved', guest_user_id = auth.uid()
      where id = v_entry_id and status in ('denied', 'requested', 'revoked', 'invited');
    return v_entry_id;
  end if;
  insert into guestlist_entries
      (event_id, guest_user_id, guest_email, guest_name, guest_phone, status, source, created_by)
  select p_event_id, auth.uid(), v_email, p.full_name, p.phone, 'approved', 'invite_link', auth.uid()
    from profiles p where p.id = auth.uid()
  returning id into v_entry_id;
  return v_entry_id;
end $$;

-- Doorman self-registration knowing only the 4-digit code (the old app looked
-- the event up by code client-side; staff_code is no longer client-readable).
-- Prefers the soonest upcoming matching event; yesterday's events still match
-- so a late-night door crew can join after midnight.
create or replace function public.register_staff_by_code(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_event events%rowtype;
  v_staff_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  select * into v_event from events
    where staff_code = trim(p_code) and status = 'published'
      and date >= (now() at time zone 'Europe/London')::date - 1
    order by date asc limit 1;
  if not found then
    raise exception 'No event found with that code';
  end if;
  select id into v_staff_id from event_staff
    where event_id = v_event.id
      and (user_id = auth.uid() or email = public.current_email());
  if v_staff_id is not null then
    return jsonb_build_object('already', true, 'event_id', v_event.id, 'event_title', v_event.title);
  end if;
  insert into event_staff (event_id, user_id, email, name, role, created_by)
  select v_event.id, auth.uid(), p.email, coalesce(p.full_name, p.email), 'doorman', auth.uid()
    from profiles p where p.id = auth.uid()
  returning id into v_staff_id;
  return jsonb_build_object('already', false, 'staff_id', v_staff_id,
    'event_id', v_event.id, 'event_title', v_event.title);
end $$;
