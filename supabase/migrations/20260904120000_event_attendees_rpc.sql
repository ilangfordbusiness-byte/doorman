-- ===========================================================================
-- "Who's Going" attendee list — server-side, visibility-aware.
--
-- guestlist_select RLS only lets a viewer read their own entry (or the whole
-- list if they're event staff), so a regular attendee's client query returned
-- nobody and "Who's Going" was empty for them. This security-definer RPC
-- returns the attendee list honoring the event's visibility, to any attendee
-- of the event (or staff).
--
-- Returns: { visibility, going_count, attendees: [{ email, name, avatar_url,
-- instagram, status }] }.
--  - visibility 'none'                -> empty attendees
--  - 'count_only', or caller not an attendee/staff -> count only, no names
--    (keeps the "buy a ticket to see who's going" teaser for non-attendees)
--  - 'show_names' + entitled          -> distinct attendees with profile fields
-- ===========================================================================
create or replace function public.get_event_attendees(p_event_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_event events%rowtype;
  v_uid uuid := auth.uid();
  v_email text := current_email()::text;
  v_entitled boolean;
  v_count int;
  v_attendees jsonb;
begin
  select * into v_event from events where id = p_event_id;
  if not found then
    raise exception 'Event not found';
  end if;

  select count(distinct lower(guest_email)) into v_count
  from guestlist_entries
  where event_id = p_event_id
    and status in ('approved', 'checked_in', 'invited');

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

  -- show_names + entitled: one row per distinct email, self excluded.
  select coalesce(jsonb_agg(a.obj order by a.obj ->> 'name'), '[]'::jsonb)
  into v_attendees
  from (
    select distinct on (lower(g.guest_email)) jsonb_build_object(
      'email', g.guest_email,
      'name', regexp_replace(coalesce(g.guest_name, g.guest_email), '\s*\(\d+ of \d+\)$', ''),
      'avatar_url', p.avatar_url,
      'instagram', p.instagram,
      'status', g.status) as obj
    from guestlist_entries g
    left join profiles p on p.id = g.guest_user_id
    where g.event_id = p_event_id
      and g.status in ('approved', 'checked_in', 'invited')
      and lower(g.guest_email) <> lower(coalesce(v_email, ''))
    order by lower(g.guest_email), g.created_at
  ) a;

  return jsonb_build_object(
    'visibility', 'show_names',
    'going_count', v_count,
    'attendees', v_attendees);
end $$;

grant execute on function public.get_event_attendees(uuid) to authenticated;
