-- ===========================================================================
-- Activity feed: a computed, paginated feed of recent social activity among the
-- current user's friends, for the Activity (Friends) tab. No stored table —
-- mirrors get_notifications / get_friend_suggestions (security definer, computed
-- on demand). Privacy: friends' attendance/hosting is only surfaced for public,
-- published, show_names events, so private/hidden events never leak.
--
-- Item types (v1):
--   friend_going   — friends attending an upcoming public event (aggregated per
--                    event, up to 5 actor avatars + a total count)
--   friend_hosting — a friend is hosting an upcoming public event
--   friend_added   — a friendship involving me was accepted in the last 30 days
-- Returns { items, total, hasMore, offset } like get_friend_suggestions.
-- ===========================================================================
create or replace function public.get_activity_feed(p_offset int default 0, p_limit int default 20)
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

  with my_edges as (
    select case when sender_id = v_uid then receiver_id else sender_id end as other, status
    from friend_requests
    where v_uid in (sender_id, receiver_id) and status in ('accepted', 'pending')
  ),
  my_friends as (select other from my_edges where status = 'accepted'),

  -- Safe, shareable display fields for an event (host name coalesces the
  -- business identity, same as get_notifications).
  ev_display as (
    select e.id as event_id,
           jsonb_build_object(
             'id', e.id, 'title', e.title, 'cover_image', e.cover_image_url,
             'date', e.date::text,
             'host_name', coalesce(b.business_name, hp.full_name)) as event_json
    from events e
    join profiles hp on hp.id = e.host_id
    left join business_accounts b on b.id = e.business_id
  ),

  -- 1. Friends going to an upcoming PUBLIC event, aggregated by event.
  going as (
    select e.id as event_id,
           max(g.created_at) as ts,
           count(distinct g.guest_user_id) as actor_count,
           to_jsonb((array_agg(distinct jsonb_build_object(
             'name', p.full_name, 'picture', p.avatar_url, 'email', p.email)))[1:5]) as actors
    from guestlist_entries g
    join my_friends mf on mf.other = g.guest_user_id
    join events e on e.id = g.event_id
    join profiles p on p.id = g.guest_user_id
    where g.status in ('approved', 'checked_in', 'invited')
      and e.is_public and e.status = 'published' and e.visibility = 'show_names'
      and e.date >= current_date
    group by e.id
  ),

  -- 2. A friend is hosting an upcoming PUBLIC event.
  hosting as (
    select e.id as event_id, e.created_at as ts,
           p.full_name, p.avatar_url, p.email
    from events e
    join my_friends mf on mf.other = e.host_id
    join profiles p on p.id = e.host_id
    where e.is_public and e.status = 'published' and e.date >= current_date
  ),

  -- 3. A friendship involving me was accepted recently.
  added as (
    select case when fr.sender_id = v_uid then fr.receiver_id else fr.sender_id end as other_id,
           fr.updated_at as ts
    from friend_requests fr
    where fr.status = 'accepted'
      and v_uid in (fr.sender_id, fr.receiver_id)
      and fr.updated_at >= now() - interval '30 days'
  ),

  feed as (
    select g.ts, jsonb_build_object(
        'type', 'friend_going', 'ts', g.ts,
        'event', ed.event_json, 'actors', g.actors, 'actor_count', g.actor_count) as item
    from going g join ev_display ed on ed.event_id = g.event_id
    union all
    select h.ts, jsonb_build_object(
        'type', 'friend_hosting', 'ts', h.ts,
        'event', ed.event_json,
        'actors', jsonb_build_array(jsonb_build_object('name', h.full_name, 'picture', h.avatar_url, 'email', h.email)),
        'actor_count', 1) as item
    from hosting h join ev_display ed on ed.event_id = h.event_id
    union all
    select a.ts, jsonb_build_object(
        'type', 'friend_added', 'ts', a.ts,
        'actors', jsonb_build_array(jsonb_build_object('name', p.full_name, 'picture', p.avatar_url, 'email', p.email)),
        'actor_count', 1) as item
    from added a join profiles p on p.id = a.other_id
  )
  select count(*) into v_total from feed;

  select coalesce(jsonb_agg(item order by ts desc), '[]'::jsonb)
  into v_items
  from (select ts, item from feed order by ts desc offset v_offset limit v_limit) s;

  return jsonb_build_object(
    'items', v_items, 'total', v_total,
    'hasMore', v_offset + v_limit < v_total, 'offset', v_offset);
end $$;

grant execute on function public.get_activity_feed(int, int) to authenticated;
