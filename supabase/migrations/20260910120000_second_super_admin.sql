-- ===========================================================================
-- Second bootstrap admin.
--
-- akshay.irudayaraj@gmail.com joins ilangfordbusiness@gmail.com as a
-- bootstrap admin: the signup trigger promotes either email on account
-- creation, and the backfill covers an account that already exists. Clients
-- still cannot write `role`, so the only paths to admin remain this trigger
-- and the adminUsers edge function.
--
-- The super-admin allow-list for "Act as user" lives alongside this in
-- supabase/functions/adminUsers/index.ts and src/pages/Admin.jsx.
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

update public.profiles set role = 'admin'
  where email = 'akshay.irudayaraj@gmail.com' and role <> 'admin';
