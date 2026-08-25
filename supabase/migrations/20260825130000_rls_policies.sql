-- DoorMan: Row Level Security, column protections, access RPCs, realtime.
--
-- Model:
--  * Clients (anon/authenticated) go through RLS. No policy for a verb = denied.
--  * Edge functions use the service role, which bypasses RLS — checkout, webhook,
--    transfers, Stripe Connect, ticket catalog writes all live there.
--  * Two tables carry columns that must never reach a browser (qr_secret, staff
--    codes, invite codes, staff-only notes). Those are enforced with column-level
--    grants; the data layer must therefore SELECT explicit column lists on
--    events / guestlist_entries / profiles / promoters — select('*') will 42501.
--  * Helper predicates are SECURITY DEFINER so policies can consult other tables
--    without recursing through their RLS.

-- ---------------------------------------------------------------------------
-- Helper predicates
-- ---------------------------------------------------------------------------
create or replace function public.current_email() returns citext
language sql stable as $$
  select nullif(auth.jwt() ->> 'email', '')::citext
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  )
$$;

-- Host, accepted co-host, or admin: may manage the event itself.
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
  or public.is_admin()
$$;

-- Manager or registered door staff: may see the guestlist and check people in.
create or replace function public.is_event_staff(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_event_manager(eid)
  or exists (
    select 1 from event_staff s
    where s.event_id = eid
      and (s.user_id = auth.uid() or s.email = public.current_email())
  )
$$;

-- On the guestlist in a live state (chat visibility, who's-going).
create or replace function public.is_event_attendee(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from guestlist_entries g
    where g.event_id = eid
      and (g.guest_user_id = auth.uid() or g.guest_email = public.current_email())
      and g.status in ('invited', 'approved', 'checked_in')
  )
$$;

create or replace function public.can_chat_in_event(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_event_staff(eid)
  or exists (
    select 1 from guestlist_entries g
    where g.event_id = eid
      and (g.guest_user_id = auth.uid() or g.guest_email = public.current_email())
      and g.status in ('invited', 'approved', 'checked_in')
      and g.can_chat
  )
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.business_accounts  enable row level security;
alter table public.events             enable row level security;
alter table public.event_co_hosts     enable row level security;
alter table public.event_staff        enable row level security;
alter table public.guestlist_entries  enable row level security;
alter table public.friend_requests    enable row level security;
alter table public.event_messages     enable row level security;
alter table public.ticket_tiers       enable row level security;
alter table public.promo_codes        enable row level security;
alter table public.promoters          enable row level security;
alter table public.ticket_orders      enable row level security;
alter table public.ticket_transfers   enable row level security;
alter table public.payouts            enable row level security;

-- ---------------------------------------------------------------------------
-- Baseline grants. RLS does the row gating; these open only the verbs clients
-- may ever use (read-only tables get no write grants at all). The per-table
-- column grants below then narrow select/update further where needed.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to authenticated;
grant select on public.ticket_tiers to anon;  -- events for anon: column grant below
grant insert, update, delete on
  public.business_accounts, public.events, public.event_co_hosts,
  public.event_staff, public.guestlist_entries, public.friend_requests,
  public.promo_codes, public.promoters
  to authenticated;
grant insert, delete on public.event_messages to authenticated;

-- ---------------------------------------------------------------------------
-- profiles: readable by any signed-in user (search, avatars, who's-going);
-- each user edits only their own row, and only safe columns (no role, no
-- Stripe fields — those are service-role territory). Rows are created by the
-- signup trigger, never by clients.
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

revoke update on public.profiles from authenticated, anon;
grant update (full_name, phone, instagram, avatar_url, active_business_id)
  on public.profiles to authenticated;
revoke select on public.profiles from authenticated, anon;
grant select (id, email, full_name, phone, instagram, avatar_url, role,
              stripe_onboarding_status, active_business_id, created_at, updated_at)
  on public.profiles to authenticated;  -- stripe_account_id stays server-side

-- ---------------------------------------------------------------------------
-- business_accounts: owner-only. Stripe columns are written by edge functions.
-- ---------------------------------------------------------------------------
create policy business_select on public.business_accounts
  for select to authenticated using (owner_id = auth.uid() or public.is_admin());
create policy business_insert on public.business_accounts
  for insert to authenticated with check (owner_id = auth.uid());
create policy business_update on public.business_accounts
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy business_delete on public.business_accounts
  for delete to authenticated using (owner_id = auth.uid());

revoke update on public.business_accounts from authenticated, anon;
grant update (business_email, business_name, business_picture_url, stripe_mode)
  on public.business_accounts to authenticated;

-- ---------------------------------------------------------------------------
-- events: readable by any signed-in user (Base44 read was open); anon may see
-- published events (public event pages / invite landing before login).
-- host_notes, staff_code, invite_code never reach clients — invite_code would
-- let anyone self-admit to private events. Managers fetch them via RPC.
-- ---------------------------------------------------------------------------
create policy events_select_auth on public.events
  for select to authenticated using (true);
create policy events_select_anon on public.events
  for select to anon using (status = 'published');
create policy events_insert on public.events
  for insert to authenticated with check (host_id = auth.uid());
create policy events_update on public.events
  for update to authenticated
  using (public.is_event_manager(id)) with check (public.is_event_manager(id));
create policy events_delete on public.events
  for delete to authenticated using (host_id = auth.uid() or public.is_admin());

revoke select on public.events from authenticated, anon;
grant select (id, host_id, business_id, title, cover_image_url, date, start_time,
              end_time, venue_name, address, venue_lat, venue_lng, dress_code,
              description, entry_notes, instagram, is_public, discoverable,
              capacity, requests_open, plus_one_allowed, status, is_paid,
              currency, visibility, created_at, updated_at)
  on public.events to authenticated, anon;
revoke update on public.events from authenticated, anon;
grant update (business_id, title, cover_image_url, date, start_time, end_time,
              venue_name, address, venue_lat, venue_lng, dress_code, description,
              entry_notes, host_notes, instagram, is_public, discoverable,
              capacity, requests_open, plus_one_allowed, status, is_paid,
              currency, visibility)
  on public.events to authenticated;  -- managers may write host_notes, not read back except via RPC
revoke insert on public.events from authenticated, anon;
grant insert (host_id, business_id, title, cover_image_url, date, start_time,
              end_time, venue_name, address, venue_lat, venue_lng, dress_code,
              description, entry_notes, host_notes, instagram, is_public,
              discoverable, capacity, requests_open, plus_one_allowed, status,
              is_paid, currency, visibility)
  on public.events to authenticated;  -- codes always come from column defaults

-- ---------------------------------------------------------------------------
-- event_co_hosts
-- ---------------------------------------------------------------------------
create policy co_hosts_select on public.event_co_hosts
  for select to authenticated
  using (public.is_event_manager(event_id)
         or user_id = auth.uid() or email = public.current_email());
create policy co_hosts_insert on public.event_co_hosts
  for insert to authenticated with check (public.is_event_manager(event_id));
create policy co_hosts_update on public.event_co_hosts
  for update to authenticated
  using (public.is_event_manager(event_id)
         or user_id = auth.uid() or email = public.current_email());
create policy co_hosts_delete on public.event_co_hosts
  for delete to authenticated
  using (public.is_event_manager(event_id)
         or user_id = auth.uid() or email = public.current_email());

-- ---------------------------------------------------------------------------
-- event_staff: managers run the roster; staff see their own row. Doorman
-- self-registration with the 4-digit code goes through register_staff_via_code.
-- ---------------------------------------------------------------------------
create policy staff_select on public.event_staff
  for select to authenticated
  using (public.is_event_manager(event_id)
         or user_id = auth.uid() or email = public.current_email());
create policy staff_insert on public.event_staff
  for insert to authenticated with check (public.is_event_manager(event_id));
create policy staff_update on public.event_staff
  for update to authenticated using (public.is_event_manager(event_id));
create policy staff_delete on public.event_staff
  for delete to authenticated
  using (public.is_event_manager(event_id) or user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- guestlist_entries: guests see their own tickets; staff see the event's list.
-- Guests may create only a pending join request on an open published event
-- (invite-link joins go through join_event_via_invite). Guests may update
-- their own entry but can never set status to checked_in — only staff can.
-- qr_secret and staff notes are excluded from client column grants.
-- ---------------------------------------------------------------------------
create policy guestlist_select on public.guestlist_entries
  for select to authenticated
  using (guest_user_id = auth.uid()
         or guest_email = public.current_email()
         or public.is_event_staff(event_id));
create policy guestlist_insert on public.guestlist_entries
  for insert to authenticated
  with check (
    public.is_event_manager(event_id)
    or (
      guest_email = public.current_email()
      and status = 'requested'
      and source = 'request'
      and exists (
        select 1 from public.events e
        where e.id = event_id and e.status = 'published' and e.requests_open
      )
    )
  );
create policy guestlist_update_staff on public.guestlist_entries
  for update to authenticated
  using (public.is_event_staff(event_id));
create policy guestlist_update_own on public.guestlist_entries
  for update to authenticated
  using (guest_user_id = auth.uid() or guest_email = public.current_email())
  with check (
    (guest_user_id = auth.uid() or guest_email = public.current_email())
    and status in ('invited', 'requested', 'approved', 'revoked')
  );
create policy guestlist_delete on public.guestlist_entries
  for delete to authenticated using (public.is_event_manager(event_id));

revoke select on public.guestlist_entries from authenticated, anon;
grant select (id, event_id, guest_user_id, guest_email, guest_name, guest_phone,
              status, source, plus_one, plus_one_name, can_chat, checked_in_at,
              checked_in_by, checked_out_at, created_by, created_at, updated_at)
  on public.guestlist_entries to authenticated;
revoke insert on public.guestlist_entries from authenticated, anon;
grant insert (event_id, guest_user_id, guest_email, guest_name, guest_phone,
              status, source, plus_one, plus_one_name, can_chat, notes, created_by)
  on public.guestlist_entries to authenticated;
revoke update on public.guestlist_entries from authenticated, anon;
grant update (guest_user_id, guest_name, guest_phone, status, plus_one,
              plus_one_name, can_chat, checked_in_at, checked_in_by,
              checked_out_at, notes)
  on public.guestlist_entries to authenticated;

-- ---------------------------------------------------------------------------
-- friend_requests: visible to both ends; sender creates (pending only);
-- either side updates (accept / decline) or deletes (unfriend / cancel).
-- ---------------------------------------------------------------------------
create policy friends_select on public.friend_requests
  for select to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());
create policy friends_insert on public.friend_requests
  for insert to authenticated
  with check (sender_id = auth.uid() and status = 'pending');
create policy friends_update on public.friend_requests
  for update to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid())
  with check (sender_id = auth.uid() or receiver_id = auth.uid());
create policy friends_delete on public.friend_requests
  for delete to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

-- ---------------------------------------------------------------------------
-- event_messages: chat is visible to staff and live attendees; sending
-- requires can_chat (hosts/staff always). Senders and managers can delete.
-- ---------------------------------------------------------------------------
create policy messages_select on public.event_messages
  for select to authenticated
  using (public.is_event_staff(event_id) or public.is_event_attendee(event_id));
create policy messages_insert on public.event_messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.can_chat_in_event(event_id));
create policy messages_delete on public.event_messages
  for delete to authenticated
  using (sender_id = auth.uid() or public.is_event_manager(event_id));

-- ---------------------------------------------------------------------------
-- ticket_tiers: world-readable (ticket picker); ALL writes go through the
-- manageTicketCatalog edge function (service role) — no client write policies.
-- ---------------------------------------------------------------------------
create policy tiers_select_auth on public.ticket_tiers
  for select to authenticated using (true);
create policy tiers_select_anon on public.ticket_tiers
  for select to anon
  using (exists (select 1 from public.events e
                 where e.id = event_id and e.status = 'published'));

-- ---------------------------------------------------------------------------
-- promo_codes: manager-only in both directions (codes are secrets); guests
-- validate a typed code via the validatePromoCode edge function.
-- ---------------------------------------------------------------------------
create policy promo_select on public.promo_codes
  for select to authenticated using (public.is_event_manager(event_id));
create policy promo_insert on public.promo_codes
  for insert to authenticated with check (public.is_event_manager(event_id));
create policy promo_update on public.promo_codes
  for update to authenticated using (public.is_event_manager(event_id));
create policy promo_delete on public.promo_codes
  for delete to authenticated using (public.is_event_manager(event_id));

revoke update on public.promo_codes from authenticated, anon;
grant update (code, discount_percent, max_uses, status)
  on public.promo_codes to authenticated;  -- counters are service-role only

-- ---------------------------------------------------------------------------
-- promoters: managers run them; a promoter sees their own record. Sales /
-- commission counters are written only by the webhook (service role) —
-- excluded from client update grants so a manager can't inflate payouts.
-- ---------------------------------------------------------------------------
create policy promoters_select on public.promoters
  for select to authenticated
  using (public.is_event_manager(event_id)
         or user_id = auth.uid() or email = public.current_email());
create policy promoters_insert on public.promoters
  for insert to authenticated with check (public.is_event_manager(event_id));
create policy promoters_update on public.promoters
  for update to authenticated using (public.is_event_manager(event_id));
create policy promoters_delete on public.promoters
  for delete to authenticated using (public.is_event_manager(event_id));

revoke update on public.promoters from authenticated, anon;
grant update (name, email, user_id, commission_type, commission_percent,
              commission_flat_minor, status, discount_type, discount_percent,
              discount_flat_minor, discount_max_uses)
  on public.promoters to authenticated;

-- ---------------------------------------------------------------------------
-- ticket_orders: guests see their own, managers see their event's. Writes are
-- exclusively checkout/webhook (service role).
-- ---------------------------------------------------------------------------
create policy orders_select on public.ticket_orders
  for select to authenticated
  using (guest_user_id = auth.uid()
         or guest_email = public.current_email()
         or public.is_event_manager(event_id));

-- ---------------------------------------------------------------------------
-- ticket_transfers: visible to both ends; all writes go through the
-- initiate/accept edge functions (service role) since they atomically
-- re-point the guestlist entry.
-- ---------------------------------------------------------------------------
create policy transfers_select on public.ticket_transfers
  for select to authenticated
  using (sender_id = auth.uid()
         or recipient_id = auth.uid()
         or recipient_email = public.current_email());

-- ---------------------------------------------------------------------------
-- payouts: read-your-own; written only by Stripe flows (service role).
-- ---------------------------------------------------------------------------
create policy payouts_select on public.payouts
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RPCs that the RLS design requires
-- ---------------------------------------------------------------------------

-- Join via shareable invite link: validates the code server-side so
-- invite_code never has to be client-readable.
create or replace function public.join_event_via_invite(p_invite_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_event public.events%rowtype;
  v_entry_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to join this event';
  end if;
  select * into v_event from events
    where invite_code = p_invite_code and status = 'published';
  if not found then
    raise exception 'Invalid or expired invite link';
  end if;
  insert into guestlist_entries
      (event_id, guest_user_id, guest_email, guest_name, status, source, created_by)
  values
      (v_event.id, auth.uid(), public.current_email(),
       (select full_name from profiles where id = auth.uid()),
       'approved', 'invite_link', auth.uid())
  returning id into v_entry_id;
  return v_entry_id;
end $$;

-- Doorman self-registration with the event's 4-digit staff code.
create or replace function public.register_staff_via_code(p_event_id uuid, p_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_staff_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  if not exists (select 1 from events where id = p_event_id and staff_code = p_code) then
    raise exception 'Incorrect staff code';
  end if;
  insert into event_staff (event_id, user_id, email, name, role, created_by)
  values (p_event_id, auth.uid(), public.current_email(),
          (select full_name from profiles where id = auth.uid()),
          'doorman', auth.uid())
  returning id into v_staff_id;
  return v_staff_id;
end $$;

-- The guest's own QR payload (same base64 JSON shape the Base44 app used, so
-- validateQR and existing pass rendering carry over unchanged).
create or replace function public.my_qr_payload(p_entry_id uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_entry public.guestlist_entries%rowtype;
begin
  select * into v_entry from guestlist_entries
    where id = p_entry_id
      and (guest_user_id = auth.uid() or guest_email = public.current_email());
  if not found then
    raise exception 'Ticket not found';
  end if;
  -- translate() strips the newlines encode() inserts every 76 chars, matching btoa
  return translate(encode(
    convert_to(json_build_object(
      'eid', v_entry.event_id, 'gid', v_entry.id, 'sec', v_entry.qr_secret
    )::text, 'utf8'), 'base64'), E'\n', '');
end $$;

-- Manager-only view of an event's protected fields.
create or replace function public.get_event_private(p_event_id uuid)
returns table (host_notes text, staff_code text, invite_code text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_event_manager(p_event_id) then
    raise exception 'Not authorized';
  end if;
  return query select e.host_notes, e.staff_code, e.invite_code
    from events e where e.id = p_event_id;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime: the three tables the app subscribes to (chat, live orders,
-- promoter stats). postgres_changes respects the RLS above.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.event_messages;
alter publication supabase_realtime add table public.ticket_orders;
alter publication supabase_realtime add table public.promoters;
