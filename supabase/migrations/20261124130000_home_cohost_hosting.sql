-- ===========================================================================
-- Home: co-hosts and business team members are "hosting" too.
--
-- get_home_dashboard only treated events.host_id as hosting. An accepted
-- co-host, or a member of the business that runs the event, saw it as "Your
-- next night out" (or not at all), and could be suggested their own event
-- under "Picked for you". Both now count as running the event: it is their
-- next plan with isHosting = true, and it is never suggested to them.
--
-- Deliberately NOT is_event_manager(): that is also true for super-admins on
-- every event, which would make every admin "host" everything on Home.
-- ===========================================================================

-- Do I run this event (host, accepted co-host, or its business's owner/team)?
-- Internal helper for get_home_dashboard; not callable by clients.
create or replace function public.home_runs_event(
  p_me uuid, p_email citext, p_event_id uuid, p_host_id uuid, p_business_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_host_id = p_me, false)
  or exists (
    select 1 from event_co_hosts c
    where c.event_id = p_event_id and c.status = 'accepted'
      and (c.user_id = p_me or c.email = p_email)
  )
  or (p_business_id is not null and (
    exists (select 1 from business_accounts b where b.id = p_business_id and b.owner_id = p_me)
    or exists (
      select 1 from business_members m
      where m.business_id = p_business_id and m.status = 'accepted'
        and (m.user_id = p_me or m.email = p_email)
    )
  ))
$$;

revoke all on function public.home_runs_event(uuid, citext, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.home_runs_event(uuid, citext, uuid, uuid, uuid) to service_role;

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
  -- own calendar, that I run (host, co-host, business team) or attend with a
  -- live entry.
  select e.* into v_event
  from events e
  where e.date >= (now() at time zone e.timezone)::date
    and e.status <> 'cancelled'
    and (
      public.home_runs_event(v_me.id, v_me.email, e.id, e.host_id, e.business_id)
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
    v_is_hosting := public.home_runs_event(v_me.id, v_me.email, v_event.id, v_event.host_id, v_event.business_id);

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
      and not public.home_runs_event(v_me.id, v_me.email, e.id, e.host_id, e.business_id)
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
