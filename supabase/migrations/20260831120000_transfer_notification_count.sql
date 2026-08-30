-- Add a pending incoming-transfer count to get_notifications so the bottom-nav
-- Discover badge can reflect ticket transfers waiting for the user (the badge
-- reads only this shared RPC; the guest dashboard the Transfers tab uses isn't
-- visible to the global nav). Preserves the business-host coalesce on co-host
-- invites added earlier.
create or replace function public.get_notifications()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me profiles%rowtype;
  v_cohost jsonb;
  v_friend_count int;
  v_invite_count int;
  v_transfer_count int;
begin
  select * into v_me from profiles where id = auth.uid();
  if not found then
    raise exception 'Unauthorized';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'event_id', e.id, 'title', e.title, 'date', e.date::text,
           'start_time', to_char(e.start_time, 'HH24:MI'),
           'host_name', coalesce(b.business_name, hp.full_name), 'host_email', hp.email,
           'host_picture', coalesce(b.business_picture_url, hp.avatar_url), 'cover_image', e.cover_image_url,
           'co_host_id', c.id)), '[]'::jsonb)
  into v_cohost
  from event_co_hosts c
  join events e on e.id = c.event_id
  join profiles hp on hp.id = e.host_id
  left join business_accounts b on b.id = e.business_id
  where c.status = 'pending'
    and (c.user_id = v_me.id or c.email = v_me.email);

  select count(*) into v_friend_count
  from friend_requests where receiver_id = v_me.id and status = 'pending';

  select count(*) into v_invite_count
  from guestlist_entries
  where (guest_user_id = v_me.id or guest_email = v_me.email)
    and status = 'invited';

  select count(*) into v_transfer_count
  from ticket_transfers
  where status = 'pending'
    and (recipient_id = v_me.id or recipient_email = v_me.email);

  return jsonb_build_object(
    'coHostInvites', v_cohost,
    'counts', jsonb_build_object(
      'coHost', jsonb_array_length(v_cohost),
      'friendRequests', v_friend_count,
      'eventInvites', v_invite_count,
      'transfers', v_transfer_count)
  );
end $$;
