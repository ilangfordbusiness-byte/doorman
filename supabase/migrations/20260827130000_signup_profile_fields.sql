-- ===========================================================================
-- Populate phone + instagram at signup.
--
-- The create-account form now collects phone and instagram and passes them in
-- the auth user metadata. Extend handle_new_user() to copy them into the
-- profile row (alongside the existing full_name / avatar_url), preserving the
-- admin-bootstrap case and the email-reconciliation backfills. Columns stay
-- nullable — Google sign-in users arrive without these and are prompted for
-- them by the onboarding gate on first sign-in.
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
