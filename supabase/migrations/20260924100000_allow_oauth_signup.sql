-- ===========================================================================
-- Allow account creation through OAuth providers again (Google, and Apple
-- for the iOS app).
--
-- 20260901120000_block_google_signup made handle_new_user() raise for a
-- brand-new Google identity because OAuth users skipped the sign-up form and
-- arrived with no phone or Instagram, then abandoned onboarding. Since then
-- PhoneSetupGate (20260914) walks every signed-in user through name, phone,
-- Instagram and profile picture before they can use the app, so the gap that
-- rule closed no longer exists. The iOS app adds Sign in with Apple, which
-- the App Store requires alongside Google; blocking either provider from
-- creating accounts would send new app users back to an email form.
--
-- Everything else in the trigger is unchanged: bootstrap admins are promoted
-- on creation and guestlist / co-host / staff / promoter / order / transfer
-- rows keyed by email are back-linked to the new user id.
-- ===========================================================================
create or replace function public.handle_new_user() returns trigger
security definer set search_path = public
language plpgsql as $$
begin
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
  update public.ticket_orders set guest_user_id = new.id
    where guest_user_id is null and guest_email = new.email;
  update public.ticket_transfers set recipient_id = new.id
    where recipient_id is null and recipient_email = new.email;

  return new;
end $$;
