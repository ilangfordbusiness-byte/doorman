-- ===========================================================================
-- Home: suggest an event when you have no plans.
--
-- get_home_dashboard already returns your next event (one you host, or attend
-- with a live entry). When there is none, it now also returns `suggested`: the
-- soonest upcoming published event that is listed on Discover (public or
-- discoverable), so Home can show "Picked for you" instead of an empty card.
--
-- Skipped: events you host, events whose host you blocked, and events where you
-- were turned away (denied / revoked). Same "today on the event's own calendar"
-- rule as the next-event lookup.
--
-- `suggested` = { event, friendsGoing, attendeeCount, fromPriceMinor }.
-- fromPriceMinor is the cheapest open, non-door tier (null when none is open);
-- door tiers stay hidden exactly as on the public event page.
-- ===========================================================================

-- My accepted friends with a live entry for an event (name, email, picture).
-- Internal helper for get_home_dashboard; not callable by clients.
create or replace function public.home_friends_going(p_me uuid, p_event_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'email', p.email, 'name', p.full_name, 'picture', p.avatar_url)), '[]'::jsonb)
  from (
    select case when fr.sender_id = p_me then fr.receiver_id else fr.sender_id end as fid
    from friend_requests fr
    where fr.status = 'accepted' and p_me in (fr.sender_id, fr.receiver_id)
  ) f
  join profiles p on p.id = f.fid
  where exists (
    select 1 from guestlist_entries g
    where g.event_id = p_event_id
      and (g.guest_user_id = p.id or g.guest_email = p.email)
      and g.status in ('approved', 'invited', 'checked_in')
  )
$$;

revoke all on function public.home_friends_going(uuid, uuid) from public, anon, authenticated;
grant execute on function public.home_friends_going(uuid, uuid) to service_role;

create or replace function public.get_home_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me profiles%rowtype;
  v_event events%rowtype;
  v_sug events%rowtype;
  v_is_hosting boolean := false;
  v_friends_going jsonb := '[]'::jsonb;
  v_attendee_count int := 0;
  v_suggested jsonb := null;
  v_sug_friends jsonb := '[]'::jsonb;
  v_sug_count int := 0;
  v_sug_price int;
begin
  select * into v_me from profiles where id = auth.uid();
  if not found then
    raise exception 'Unauthorized';
  end if;

  -- Next upcoming: earliest non-cancelled event that is today-or-later on its
  -- own calendar, that I host or attend with a live entry.
  select e.* into v_event
  from events e
  where e.date >= (now() at time zone e.timezone)::date
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

    v_friends_going := public.home_friends_going(v_me.id, v_event.id);
  else
    -- Nothing planned: suggest the soonest event on Discover.
    select e.* into v_sug
    from events e
    where e.date >= (now() at time zone e.timezone)::date
      and e.status = 'published'
      and (e.is_public or e.discoverable)
      and e.host_id <> v_me.id
      and not exists (
        select 1 from user_blocks b
        where b.blocker_id = v_me.id and b.blocked_id = e.host_id
      )
      and not exists (
        select 1 from guestlist_entries g
        where g.event_id = e.id
          and (g.guest_user_id = v_me.id or g.guest_email = v_me.email)
          and g.status in ('denied', 'revoked')
      )
    order by e.date, e.start_time nulls last, e.created_at
    limit 1;

    if found then
      select count(distinct g.guest_email) into v_sug_count
      from guestlist_entries g
      where g.event_id = v_sug.id
        and g.status in ('approved', 'invited', 'checked_in');

      select min(t.price_minor) into v_sug_price
      from ticket_tiers t
      where t.event_id = v_sug.id
        and t.sales_status = 'open'
        and not t.door_only;

      v_sug_friends := public.home_friends_going(v_me.id, v_sug.id);

      v_suggested := jsonb_build_object(
        'event', public.event_public_json(v_sug),
        'friendsGoing', v_sug_friends,
        'attendeeCount', v_sug_count,
        'fromPriceMinor', v_sug_price
      );
    end if;
  end if;

  return jsonb_build_object(
    'user', jsonb_build_object(
      'email', v_me.email, 'phone', v_me.phone, 'full_name', v_me.full_name,
      'instagram', v_me.instagram, 'profile_picture', v_me.avatar_url),
    'event', case when v_event.id is null then null
                  else public.event_public_json(v_event) end,
    'isHosting', v_is_hosting,
    'friendsGoing', v_friends_going,
    'attendeeCount', v_attendee_count,
    'suggested', v_suggested
  );
end $$;
