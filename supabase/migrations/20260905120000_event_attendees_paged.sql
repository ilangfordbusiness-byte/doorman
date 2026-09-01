-- ===========================================================================
-- Paginate get_event_attendees: the "Who's Going" list now shows a 10-person
-- preview and a full paginated view (batches of 50). Adds p_offset/p_limit and
-- makes going_count the number of OTHER attendees (excludes the caller) so it
-- matches the paginated list and its page count. Same entitlement/visibility
-- rules as before (20260904120000_event_attendees_rpc.sql).
-- ===========================================================================
drop function if exists public.get_event_attendees(uuid);

create or replace function public.get_event_attendees(
  p_event_id uuid, p_offset int default 0, p_limit int default 50)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_event events%rowtype;
  v_uid uuid := auth.uid();
  v_email text := current_email()::text;
  v_entitled boolean;
  v_count int;
  v_offset int := greatest(0, coalesce(p_offset, 0));
  v_limit int := least(100, greatest(1, coalesce(p_limit, 50)));
  v_attendees jsonb;
begin
  select * into v_event from events where id = p_event_id;
  if not found then
    raise exception 'Event not found';
  end if;

  -- Distinct going attendees, excluding the caller (matches the list below).
  select count(*) into v_count from (
    select distinct lower(guest_email) e
    from guestlist_entries
    where event_id = p_event_id
      and status in ('approved', 'checked_in', 'invited')
      and lower(guest_email) <> lower(coalesce(v_email, ''))
  ) c;

  v_entitled := is_event_staff(p_event_id) or exists (
    select 1 from guestlist_entries
    where event_id = p_event_id
      and status in ('approved', 'checked_in', 'invited')
      and (guest_user_id = v_uid or lower(guest_email) = lower(coalesce(v_email, '')))
  );

  if v_event.visibility = 'none'
     or v_event.visibility = 'count_only'
     or not v_entitled then
    return jsonb_build_object(
      'visibility', v_event.visibility,
      'going_count', v_count,
      'attendees', '[]'::jsonb);
  end if;

  -- show_names + entitled: one row per distinct email (self excluded), ordered
  -- by name, sliced to the requested page.
  with distinct_att as (
    select distinct on (lower(g.guest_email))
      g.guest_email as email,
      regexp_replace(coalesce(g.guest_name, g.guest_email), '\s*\(\d+ of \d+\)$', '') as name,
      p.avatar_url, p.instagram, g.status
    from guestlist_entries g
    left join profiles p on p.id = g.guest_user_id
    where g.event_id = p_event_id
      and g.status in ('approved', 'checked_in', 'invited')
      and lower(g.guest_email) <> lower(coalesce(v_email, ''))
    order by lower(g.guest_email), g.created_at
  ),
  page as (
    select * from distinct_att order by name offset v_offset limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'email', email, 'name', name, 'avatar_url', avatar_url,
    'instagram', instagram, 'status', status) order by name), '[]'::jsonb)
  into v_attendees from page;

  return jsonb_build_object(
    'visibility', 'show_names',
    'going_count', v_count,
    'attendees', v_attendees);
end $$;

grant execute on function public.get_event_attendees(uuid, int, int) to authenticated;
