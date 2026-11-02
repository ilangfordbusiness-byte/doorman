-- ===========================================================================
-- Stop auto-adopting the Google (OAuth) profile picture at sign-up.
--
-- handle_new_user() seeded profiles.avatar_url from
-- raw_user_meta_data ->> 'avatar_url'. For a Google sign-in Supabase fills
-- that with the user's Google account photo (lh3.googleusercontent.com), so
-- new Google users silently ended up with their Google picture as their
-- DoorMan avatar. Email sign-ups never set it (there's no session to upload a
-- photo at that point), and nothing re-syncs it on later logins — so this was
-- the only path that pulled it in.
--
-- Now the avatar starts empty for everyone. PhoneSetupGate already walks every
-- new user through adding a profile picture, and they can upload one in
-- Profile. Everything else in the trigger is unchanged.
--
-- Existing profiles are intentionally left as-is (people who already have a
-- Google picture keep it until they change it themselves).
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
    null,  -- never adopt the OAuth provider's picture; the user sets their own
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
