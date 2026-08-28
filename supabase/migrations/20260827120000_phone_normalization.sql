-- Phone normalization: canonicalize stored numbers to E.164 and let phone
-- matching actually work. Companion of the client-side normalizePhone
-- (src/lib/phone.js) — after this migration all writes arrive normalized
-- through the compat layer; the SQL function exists for the one-time data
-- fix below and as defense inside RPCs.
--
-- Also fixes a latent access bug: event_staff rows added by phone were
-- invisible to their owner (the select policy and is_event_staff matched
-- user_id/email only), so phone-added doormen had no staff access at all.

-- ---------------------------------------------------------------------------
-- A. normalize_phone: integrity-adjacent canonicalization (like citext for
--    emails). Lenient by design — anything unrecognized passes through as
--    typed. Rules are order-dependent; the E.164 check runs first so already
--    canonical values are never double-prefixed.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_phone(p text)
returns text language plpgsql immutable as $$
declare
  raw text := trim(coalesce(p, ''));
  c   text;
begin
  if raw = '' then return null; end if;
  -- strip spaces and common punctuation for classification
  c := regexp_replace(raw, '[\s\-\.\(\)]', '', 'g');

  if c ~ '^\+[1-9][0-9]{6,14}$' then return c;                       -- already E.164
  elsif c ~ '^00[1-9][0-9]{6,14}$' then return '+' || substr(c, 3);  -- 00 international prefix
  elsif c ~ '^0[0-9]{9,10}$' then return '+44' || substr(c, 2);      -- UK national (mobile + landline)
  elsif c ~ '^7[0-9]{9}$' then return '+44' || c;                    -- UK mobile without trunk 0
  elsif c ~ '^447[0-9]{9}$' then return '+' || c;                    -- bare "44" mobiles only: an
                                                                     -- 11-digit 44... could be a
                                                                     -- foreign national number
  elsif c ~ '^1[2-9][0-9]{9}$' then return '+' || c;                 -- NANP with leading 1
  else return raw;                                                   -- lenient: leave as typed
  end if;
  -- Deliberately no bare-10-digit -> +1 rule: for a UK-primary audience
  -- "2079460000" is more likely a London landline missing its 0.
end $$;

-- ---------------------------------------------------------------------------
-- B. One-time data fix. No unique index involves these columns, so
--    normalization cannot collide; rows that converge textually were
--    already app-level duplicates.
-- ---------------------------------------------------------------------------
update public.profiles set phone = public.normalize_phone(phone)
  where phone is not null and phone is distinct from public.normalize_phone(phone);
update public.event_staff set phone = public.normalize_phone(phone)
  where phone is not null and phone is distinct from public.normalize_phone(phone);
update public.guestlist_entries set guest_phone = public.normalize_phone(guest_phone)
  where guest_phone is not null and guest_phone is distinct from public.normalize_phone(guest_phone);

-- join_public_event copies profiles.phone into guest_phone; the source is now
-- always normalized, but wrap it anyway so the RPC can never write a raw one.
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
  select p_event_id, auth.uid(), v_email, p.full_name, public.normalize_phone(p.phone),
         'approved', 'invite_link', auth.uid()
    from profiles p where p.id = auth.uid()
  returning id into v_entry_id;
  return v_entry_id;
end $$;

-- ---------------------------------------------------------------------------
-- C. Staff/guest access by phone.
-- ---------------------------------------------------------------------------

-- The caller's (normalized) profile phone; phone lives in profiles, not the
-- JWT, hence the lookup that current_email() doesn't need.
create or replace function public.current_phone() returns text
language sql stable security definer set search_path = public as $$
  select phone from profiles where id = auth.uid()
$$;

create or replace function public.is_event_staff(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_event_manager(eid)
  or exists (
    select 1 from event_staff s
    where s.event_id = eid
      and (s.user_id = auth.uid()
           or s.email = public.current_email()
           or (s.phone is not null and s.phone = public.current_phone()))
  )
$$;

drop policy staff_select on public.event_staff;
create policy staff_select on public.event_staff
  for select to authenticated
  using (public.is_event_manager(event_id)
         or user_id = auth.uid()
         or email = public.current_email()
         or (phone is not null and phone = public.current_phone()));

-- Guests whose entry was added phone-only get the same direct-table access
-- that email-added guests have (get_guest_dashboard already matched them).
drop policy guestlist_select on public.guestlist_entries;
create policy guestlist_select on public.guestlist_entries
  for select to authenticated
  using (guest_user_id = auth.uid()
         or guest_email = public.current_email()
         or (guest_phone is not null and guest_phone = public.current_phone())
         or public.is_event_staff(event_id));
drop policy guestlist_update_own on public.guestlist_entries;
create policy guestlist_update_own on public.guestlist_entries
  for update to authenticated
  using (guest_user_id = auth.uid()
         or guest_email = public.current_email()
         or (guest_phone is not null and guest_phone = public.current_phone()))
  with check (
    (guest_user_id = auth.uid()
     or guest_email = public.current_email()
     or (guest_phone is not null and guest_phone = public.current_phone()))
    and status in ('invited', 'requested', 'approved', 'revoked')
  );

-- Durable back-linking: profiles gain their phone AFTER signup (PhoneSetupGate),
-- so the phone write — not signup — is the moment pre-signup rows can be
-- claimed, mirroring what handle_new_user does by email at signup.
create or replace function public.link_rows_by_phone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phone is not null and new.phone is distinct from old.phone then
    update public.event_staff set user_id = new.id
      where user_id is null and phone = new.phone;
    update public.guestlist_entries set guest_user_id = new.id
      where guest_user_id is null and guest_phone = new.phone;
  end if;
  return new;
end $$;

drop trigger if exists on_profile_phone_set on public.profiles;
create trigger on_profile_phone_set
  after update of phone on public.profiles
  for each row execute function public.link_rows_by_phone();

-- One-time claim of pre-existing rows now that everything is normalized;
-- the trigger only covers phone changes from here on.
update public.event_staff s set user_id = p.id
  from public.profiles p
  where s.user_id is null and s.phone is not null and s.phone = p.phone;
update public.guestlist_entries g set guest_user_id = p.id
  from public.profiles p
  where g.guest_user_id is null and g.guest_phone is not null and g.guest_phone = p.phone;

-- The new policy arms and the backlink trigger both filter on these columns
-- (their email twins are indexed since the initial schema).
create index event_staff_phone_idx on public.event_staff (phone);
create index guestlist_entries_guest_phone_idx on public.guestlist_entries (guest_phone);
