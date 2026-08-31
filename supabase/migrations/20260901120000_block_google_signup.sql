-- ===========================================================================
-- Google is sign-in only — block NEW account creation via Google.
--
-- Google OAuth should only authenticate people who already have an account;
-- it must not silently create a new one (Google sign-ups skip the create-
-- account form, so they arrive with no phone/instagram and often an abandoned
-- onboarding). New accounts must come through email sign-up instead.
--
-- Enforcement lives in handle_new_user(), the AFTER INSERT trigger on
-- auth.users: raising here rolls back the auth.users insert, so no account is
-- created. This only fires on INSERT (i.e. first-ever sign-in for a provider),
-- so EXISTING Google users are unaffected — signing in doesn't re-insert their
-- auth row and never runs this trigger. Email sign-ups are likewise unaffected.
--
-- The rest of the function body is preserved verbatim from
-- 20260827130000_signup_profile_fields.sql.
-- ===========================================================================
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
    case when new.email = 'ilangfordbusiness@gmail.com' then 'admin' else 'user' end
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
