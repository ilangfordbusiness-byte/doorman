-- Door list invites show up in the app, not only by email.
--
--  * door_list_members.opened_at: null until the invitee first opens the list.
--  * door_list_mark_opened(list): the invitee stamps their own row (and links
--    their account if they were invited before signing up).
--  * get_notifications() gains doorListInvites (unopened shared lists) and
--    counts.doorListInvite, which drive the Activity/Profile cards and the
--    bottom-nav badge. Adding keys is backward compatible with older builds.

alter table public.door_list_members add column if not exists opened_at timestamptz;

create or replace function public.door_list_mark_opened(p_list_id uuid)
returns void
language sql volatile security definer set search_path = public as $$
  update door_list_members
     set opened_at = coalesce(opened_at, now()),
         user_id = coalesce(user_id, auth.uid())
   where list_id = p_list_id
     and (user_id = auth.uid() or email = current_email());
$$;
revoke all on function public.door_list_mark_opened(uuid) from public, anon;
grant execute on function public.door_list_mark_opened(uuid) to authenticated, service_role;

create or replace function public.get_notifications()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me profiles%rowtype;
  v_cohost jsonb;
  v_biz jsonb;
  v_door jsonb;
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

  select coalesce(jsonb_agg(jsonb_build_object(
           'business_id', b.id, 'business_name', b.business_name,
           'business_picture', b.business_picture_url, 'member_id', m.id)), '[]'::jsonb)
  into v_biz
  from business_members m
  join business_accounts b on b.id = m.business_id
  where m.status = 'pending'
    and (m.user_id = v_me.id or m.email = v_me.email);

  select coalesce(jsonb_agg(jsonb_build_object(
           'list_id', l.id, 'list_name', l.name,
           'owner_name', op.full_name, 'owner_picture', op.avatar_url,
           'invited_at', m.created_at) order by m.created_at desc), '[]'::jsonb)
  into v_door
  from door_list_members m
  join door_lists l on l.id = m.list_id
  join profiles op on op.id = l.owner_id
  where m.opened_at is null
    and (m.user_id = v_me.id or m.email = v_me.email);

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
    'businessInvites', v_biz,
    'doorListInvites', v_door,
    'counts', jsonb_build_object(
      'coHost', jsonb_array_length(v_cohost),
      'businessInvite', jsonb_array_length(v_biz),
      'doorListInvite', jsonb_array_length(v_door),
      'friendRequests', v_friend_count,
      'eventInvites', v_invite_count,
      'transfers', v_transfer_count)
  );
end $$;
