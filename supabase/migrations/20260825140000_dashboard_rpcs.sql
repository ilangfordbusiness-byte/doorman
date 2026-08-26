-- DoorMan: dashboard read RPCs.
--
-- Replaces the original app read-path functions (getHomeDashboard, getGuestDashboard,
-- getNotifications, getFriendSuggestions, resolvePromoterRef) with SQL. Each
-- existed only to stitch joins server-side; here they are single queries.
-- (getProfiles needs no RPC at all — profiles are RLS-readable, the data layer
-- queries them directly.)
--
-- All are SECURITY DEFINER because they aggregate rows the caller's RLS hides
-- (other guests' entries for counts, other users' friendships for mutuals).
-- Each therefore returns explicitly whitelisted fields only — never to_jsonb()
-- of a whole row, which would leak protected columns like qr_secret.
-- Output keys deliberately match the old payloads (cover_image,
-- host_picture, guestStatus, ...) so the pages port unchanged.

-- Public event shape shared by the dashboard payloads.
create or replace function public.event_public_json(e public.events)
returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'cover_image', e.cover_image_url,
    'date', e.date::text,
    'start_time', to_char(e.start_time, 'HH24:MI'),
    'end_time', to_char(e.end_time, 'HH24:MI'),
    'venue_name', e.venue_name,
    'address', e.address,
    'venue_lat', e.venue_lat,
    'venue_lng', e.venue_lng,
    'dress_code', e.dress_code,
    'description', e.description,
    'entry_notes', e.entry_notes,
    'instagram', e.instagram,
    'is_public', e.is_public,
    'discoverable', e.discoverable,
    'capacity', e.capacity,
    'requests_open', e.requests_open,
    'plus_one_allowed', e.plus_one_allowed,
    'status', e.status,
    'is_paid', e.is_paid,
    'currency', e.currency,
    'visibility', e.visibility,
    'business_id', e.business_id,
    'host_id', e.host_id
  )
$$;

-- ---------------------------------------------------------------------------
-- Home dashboard: me + next upcoming event (attending or hosting) + which of
-- my friends are going + attendee count. One call, no N+1.
-- ---------------------------------------------------------------------------
create or replace function public.get_home_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me profiles%rowtype;
  v_event events%rowtype;
  v_is_hosting boolean := false;
  v_friends_going jsonb := '[]'::jsonb;
  v_attendee_count int := 0;
  v_today date := (now() at time zone 'Europe/London')::date;
begin
  select * into v_me from profiles where id = auth.uid();
  if not found then
    raise exception 'Unauthorized';
  end if;

  -- Next upcoming: earliest non-cancelled event today or later that I host
  -- or attend with a live entry.
  select e.* into v_event
  from events e
  where e.date >= v_today
    and e.status <> 'cancelled'
    and (
      e.host_id = v_me.id
      or exists (
        select 1 from guestlist_entries g
        where g.event_id = e.id
          and (g.guest_user_id = v_me.id or g.guest_email = v_me.email)
          and g.status in ('approved', 'invited', 'checked_in')
      )
    )
  order by e.date, e.start_time
  limit 1;

  if found then
    v_is_hosting := v_event.host_id = v_me.id;

    select count(distinct g.guest_email) into v_attendee_count
    from guestlist_entries g
    where g.event_id = v_event.id
      and g.status in ('approved', 'invited', 'checked_in');

    select coalesce(jsonb_agg(jsonb_build_object(
             'email', p.email, 'name', p.full_name, 'picture', p.avatar_url)), '[]'::jsonb)
    into v_friends_going
    from (
      select case when fr.sender_id = v_me.id then fr.receiver_id else fr.sender_id end as fid
      from friend_requests fr
      where fr.status = 'accepted' and v_me.id in (fr.sender_id, fr.receiver_id)
    ) f
    join profiles p on p.id = f.fid
    where exists (
      select 1 from guestlist_entries g
      where g.event_id = v_event.id
        and (g.guest_user_id = p.id or g.guest_email = p.email)
        and g.status in ('approved', 'invited', 'checked_in')
    );
  end if;

  return jsonb_build_object(
    'user', jsonb_build_object(
      'email', v_me.email, 'phone', v_me.phone, 'full_name', v_me.full_name,
      'instagram', v_me.instagram, 'profile_picture', v_me.avatar_url),
    'event', case when v_event.id is null then null
                  else public.event_public_json(v_event) end,
    'isHosting', v_is_hosting,
    'friendsGoing', v_friends_going,
    'attendeeCount', v_attendee_count
  );
end $$;

-- ---------------------------------------------------------------------------
-- Guest hub: my invites/tickets (by email or phone) with their events, plus
-- pending ticket transfers in both directions.
-- ---------------------------------------------------------------------------
create or replace function public.get_guest_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me profiles%rowtype;
  v_invites jsonb;
  v_incoming jsonb;
  v_outgoing jsonb;
begin
  select * into v_me from profiles where id = auth.uid();
  if not found then
    raise exception 'Unauthorized';
  end if;

  -- Newest entry per event, event resolved in the same query.
  select coalesce(jsonb_agg(
           public.event_public_json(e)
             || jsonb_build_object('guestStatus', g.status, 'entryId', g.id)
           order by g.created_at desc), '[]'::jsonb)
  into v_invites
  from (
    select distinct on (event_id) *
    from guestlist_entries
    where guest_user_id = v_me.id
       or guest_email = v_me.email
       or (v_me.phone is not null and guest_phone = v_me.phone)
    order by event_id, created_at desc
  ) g
  join events e on e.id = g.event_id;

  select coalesce(jsonb_agg(t.j order by t.created_at desc), '[]'::jsonb) into v_incoming
  from (
    select tt.created_at, jsonb_build_object(
      'id', tt.id, 'event_id', tt.event_id, 'event_title', e.title,
      'guestlist_entry_id', tt.guestlist_entry_id, 'status', tt.status,
      'sender_email', sp.email, 'sender_name', sp.full_name,
      'recipient_email', tt.recipient_email,
      'created_date', tt.created_at) as j
    from ticket_transfers tt
    join events e on e.id = tt.event_id
    join profiles sp on sp.id = tt.sender_id
    where tt.status = 'pending'
      and (tt.recipient_id = v_me.id or tt.recipient_email = v_me.email)
  ) t;

  select coalesce(jsonb_agg(t.j order by t.created_at desc), '[]'::jsonb) into v_outgoing
  from (
    select tt.created_at, jsonb_build_object(
      'id', tt.id, 'event_id', tt.event_id, 'event_title', e.title,
      'guestlist_entry_id', tt.guestlist_entry_id, 'status', tt.status,
      'recipient_email', tt.recipient_email,
      'recipient_name', coalesce(rp.full_name, tt.recipient_email),
      'created_date', tt.created_at) as j
    from ticket_transfers tt
    join events e on e.id = tt.event_id
    left join profiles rp on rp.id = tt.recipient_id
    where tt.status = 'pending' and tt.sender_id = v_me.id
  ) t;

  return jsonb_build_object(
    'inviteEvents', v_invites,
    'transfers', jsonb_build_object('incoming', v_incoming, 'outgoing', v_outgoing)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Notification badges: pending co-host invites (with event details), pending
-- friend requests, open event invites — one call shared by every badge.
-- ---------------------------------------------------------------------------
create or replace function public.get_notifications()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me profiles%rowtype;
  v_cohost jsonb;
  v_friend_count int;
  v_invite_count int;
begin
  select * into v_me from profiles where id = auth.uid();
  if not found then
    raise exception 'Unauthorized';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'event_id', e.id, 'title', e.title, 'date', e.date::text,
           'start_time', to_char(e.start_time, 'HH24:MI'),
           'host_name', hp.full_name, 'host_email', hp.email,
           'host_picture', hp.avatar_url, 'cover_image', e.cover_image_url,
           'co_host_id', c.id)), '[]'::jsonb)
  into v_cohost
  from event_co_hosts c
  join events e on e.id = c.event_id
  join profiles hp on hp.id = e.host_id
  where c.status = 'pending'
    and (c.user_id = v_me.id or c.email = v_me.email);

  select count(*) into v_friend_count
  from friend_requests where receiver_id = v_me.id and status = 'pending';

  select count(*) into v_invite_count
  from guestlist_entries
  where (guest_user_id = v_me.id or guest_email = v_me.email)
    and status = 'invited';

  return jsonb_build_object(
    'coHostInvites', v_cohost,
    'counts', jsonb_build_object(
      'coHost', jsonb_array_length(v_cohost),
      'friendRequests', v_friend_count,
      'eventInvites', v_invite_count)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Friend suggestions: everyone I'm not already friends/pending with, ranked
-- by mutual-friend count. Needs definer rights to see others' friendships.
-- ---------------------------------------------------------------------------
create or replace function public.get_friend_suggestions(p_offset int default 0, p_limit int default 20)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_offset int := greatest(0, coalesce(p_offset, 0));
  v_limit int := least(100, greatest(1, coalesce(p_limit, 20)));
  v_total int;
  v_items jsonb;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  select count(*),
         coalesce(jsonb_agg(jsonb_build_object(
             'email', s.email, 'full_name', s.full_name,
             'profile_picture', s.avatar_url, 'instagram', s.instagram,
             'mutual', s.mutual) order by s.rn)
           filter (where s.rn > v_offset and s.rn <= v_offset + v_limit),
           '[]'::jsonb)
  into v_total, v_items
  from (
    with my_edges as (
      select case when sender_id = v_uid then receiver_id else sender_id end as other,
             status
      from friend_requests
      where v_uid in (sender_id, receiver_id) and status in ('accepted', 'pending')
    ),
    my_friends as (select other from my_edges where status = 'accepted'),
    mutuals as (
      select case when fr.sender_id = mf.other then fr.receiver_id else fr.sender_id end as cand,
             count(*) as n
      from friend_requests fr
      join my_friends mf on fr.status = 'accepted' and mf.other in (fr.sender_id, fr.receiver_id)
      group by 1
    )
    select p.email, p.full_name, p.avatar_url, p.instagram,
           coalesce(m.n, 0)::int as mutual,
           row_number() over (order by coalesce(m.n, 0) desc, p.full_name asc) as rn
    from profiles p
    left join mutuals m on m.cand = p.id
    where p.id <> v_uid
      and p.id not in (select other from my_edges)
  ) s;

  return jsonb_build_object(
    'items', v_items, 'total', v_total,
    'hasMore', v_offset + v_limit < v_total, 'offset', v_offset);
end $$;

-- ---------------------------------------------------------------------------
-- Promoter link resolver: public (works for signed-out guests opening a link);
-- validates the tracking code and returns only display fields, optionally
-- counting a click. Promoter rows themselves stay RLS-hidden.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_promoter_ref(
  p_event_id uuid, p_code text, p_count_click boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p promoters%rowtype;
begin
  select * into v_p from promoters
    where event_id = p_event_id and tracking_code = trim(p_code);
  if not found or v_p.status <> 'active' then
    return jsonb_build_object('valid', false);
  end if;

  if p_count_click then
    update promoters set clicks = clicks + 1 where id = v_p.id;
  end if;

  return jsonb_build_object(
    'valid', true,
    'promoter', jsonb_build_object(
      'tracking_code', v_p.tracking_code,
      'name', v_p.name,
      'discount_type', v_p.discount_type,
      'discount_percent', v_p.discount_percent,
      'discount_flat_minor', v_p.discount_flat_minor,
      'discount_max_uses', v_p.discount_max_uses,
      'discount_used_count', v_p.discount_used_count));
end $$;

grant execute on function public.resolve_promoter_ref(uuid, text, boolean) to anon;
