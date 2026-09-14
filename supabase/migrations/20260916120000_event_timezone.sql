-- ===========================================================================
-- Per-event time zone. Events store a bare date + wall-clock start/end; until
-- now every consumer silently picked a zone (Europe/London in refunds, promoter
-- payouts, emails and two RPCs; UTC in reminders and auto-checkout; the
-- browser in the SPA). events.timezone names the IANA zone the times are
-- written in, set from the host's browser at creation; existing rows keep
-- Europe/London so nothing changes for them.
-- ===========================================================================

-- A zone name Postgres can actually resolve; used by the check constraint so a
-- bad value can never break `at time zone` inside the dashboard RPCs.
create or replace function public.is_time_zone(p text)
returns boolean language plpgsql immutable as $$
begin
  if p is null or p = '' or length(p) > 64 then return false; end if;
  perform now() at time zone p;
  return true;
exception when others then
  return false;
end $$;

alter table public.events
  add column if not exists timezone text not null default 'Europe/London';
alter table public.events
  add constraint events_timezone_valid check (public.is_time_zone(timezone));

-- events uses explicit column-list grants (rls_policies migration); the zone
-- is public event info and host-writable like date/start_time.
grant select (timezone) on public.events to authenticated, anon;
grant insert (timezone) on public.events to authenticated;
grant update (timezone) on public.events to authenticated;

-- --- event_public_json: emit the zone (latest = 20260825140000) -----------
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
    'timezone', e.timezone,
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

-- --- get_home_dashboard: "today" per event zone (latest = 20260825140000) --
create or replace function public.get_home_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me profiles%rowtype;
  v_event events%rowtype;
  v_is_hosting boolean := false;
  v_friends_going jsonb := '[]'::jsonb;
  v_attendee_count int := 0;
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

-- --- register_staff_by_code: yesterday-or-later in the event's zone ---------
-- (latest = 20260825180000)
create or replace function public.register_staff_by_code(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_event events%rowtype;
  v_staff_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  select * into v_event from events
    where staff_code = trim(p_code) and status = 'published'
      and date >= (now() at time zone timezone)::date - 1
    order by date asc limit 1;
  if not found then
    raise exception 'No event found with that code';
  end if;
  select id into v_staff_id from event_staff
    where event_id = v_event.id
      and (user_id = auth.uid() or email = public.current_email());
  if v_staff_id is not null then
    return jsonb_build_object('already', true, 'event_id', v_event.id, 'event_title', v_event.title);
  end if;
  insert into event_staff (event_id, user_id, email, name, role, created_by)
  select v_event.id, auth.uid(), p.email, coalesce(p.full_name, p.email), 'doorman', auth.uid()
    from profiles p where p.id = auth.uid()
  returning id into v_staff_id;
  return jsonb_build_object('already', false, 'staff_id', v_staff_id,
    'event_id', v_event.id, 'event_title', v_event.title);
end $$;
