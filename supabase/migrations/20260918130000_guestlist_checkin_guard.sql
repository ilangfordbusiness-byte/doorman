-- Single-use check-in integrity for guest self-service writes.
--
-- Two related holes let a guest tamper with their own door check-in:
--
-- 1. QR REUSE. The guestlist_update_own policy only forbids a guest from
--    setting status TO 'checked_in' (its WITH CHECK list omits that value). It
--    does nothing about moving a row OUT of 'checked_in'. Column grants let an
--    authenticated user write status/checked_in_at/checked_in_by on their own
--    entry, so a guest who was already scanned could PATCH their entry back to
--    'approved' and null the stamp; validateQR keys off status, so the same QR
--    then checks in again. The single-use ticket was defeated.
--
-- 2. GEOFENCE CHECKOUT BLOCKED. The same WITH CHECK list omitting 'checked_in'
--    means a checked-in guest's own checked_out_at write (the >300m auto
--    checkout in GuestPass) is rejected with a 403 — the feature never worked
--    for anyone actually at the event.
--
-- Fix: make a trigger the single source of truth for guest-driven check-in
-- transitions (a policy can't compare old and new row in one pass), then let
-- the policy allow the 'checked_in' status value so the geofence write passes.
-- Staff, host/co-hosts and the service-role edge functions are unaffected.

-- SECURITY INVOKER (the default) is deliberate: the guard must see the caller's
-- effective role in current_user. A SECURITY DEFINER function would report the
-- owner (postgres) and wave every caller through.
create or replace function public.guard_guestlist_checkin()
returns trigger
language plpgsql as $$
begin
  -- Trusted callers: service-role edge functions (validateQR check-in),
  -- postgres in migrations/cron. Only 'authenticated' is an untrusted client;
  -- 'anon' cannot pass the update policy at all.
  if current_user <> 'authenticated' then
    return new;
  end if;
  -- Staff, host and co-hosts run the door and the guestlist.
  if public.is_event_staff(new.event_id) then
    return new;
  end if;

  -- From here the caller is a guest editing their own entry.
  -- Check-in is a door action: a guest can neither grant nor revoke it.
  if new.status is distinct from old.status
     and 'checked_in' in (new.status, old.status) then
    raise exception 'Only door staff can check a ticket in or out'
      using errcode = 'check_violation';
  end if;
  -- ...and can never write the check-in stamp themselves.
  if new.checked_in_at is distinct from old.checked_in_at
     or new.checked_in_by is distinct from old.checked_in_by then
    raise exception 'check-in fields are set at the door, not by the guest'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists guestlist_checkin_guard on public.guestlist_entries;
create trigger guestlist_checkin_guard
  before update on public.guestlist_entries
  for each row execute function public.guard_guestlist_checkin();

-- Allow the 'checked_in' status value through the owner policy so a checked-in
-- guest can still write checked_out_at (geofence). The trigger above, not this
-- list, is what stops a guest from reaching or leaving 'checked_in'.
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
    and status in ('invited', 'requested', 'approved', 'revoked', 'checked_in')
  );
