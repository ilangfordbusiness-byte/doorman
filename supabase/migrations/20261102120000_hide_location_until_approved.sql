-- ===========================================================================
-- Hide the location until a guest is approved (opt-in, non-paid events).
--
-- When a host turns this on, the event's venue_name / address / venue_lat /
-- venue_lng are shown only to people who are allowed to have them: the host,
-- co-hosts, door staff, and guests whose guestlist entry is approved or
-- checked in. Everyone else (pending/requested/invited/waitlisted guests, and
-- anyone just viewing a public event) sees no location until they're approved.
--
-- Enforced in the database, not the UI: the four location columns are no longer
-- granted for direct client SELECT, so a client can only obtain them through
-- get_events_location (the client read path) or event_public_json (the invite /
-- preview / dashboard RPCs) — both of which mask them via
-- can_see_event_location. Writes are unchanged (hosts still set the venue), and
-- service_role keeps its grant, so ticket emails still include the venue for
-- the approved guests who receive them. Paid events are unaffected by the flag.
-- ===========================================================================

alter table public.events
  add column if not exists hide_location_until_approved boolean not null default false;

-- Readable + writable like the other event flags (the client needs to read it
-- to render the "revealed once you're approved" placeholder and the toggle).
grant select (hide_location_until_approved) on public.events to authenticated, anon;
grant insert (hide_location_until_approved) on public.events to authenticated;
grant update (hide_location_until_approved) on public.events to authenticated;

-- The location columns can no longer be read directly by clients; they come
-- only through the masking paths below. Writes (insert/update) are untouched,
-- and service_role (edge functions) is unaffected.
revoke select (venue_name, address, venue_lat, venue_lng)
  on public.events from authenticated, anon;

-- Who may see a hidden event's location. Non-hidden (or paid) events always
-- pass. Otherwise: managers / staff, or a guest with an approved/checked-in
-- entry. Security definer so it can read guestlist_entries past RLS.
create or replace function public.can_see_event_location(eid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from events e
    where e.id = eid
      and (
        not e.hide_location_until_approved
        or e.is_paid
        or public.is_event_staff(eid)
        or exists (
          select 1 from guestlist_entries g
          where g.event_id = eid
            and (g.guest_user_id = auth.uid() or g.guest_email = public.current_email())
            and g.status in ('approved', 'checked_in')
        )
      )
  )
$$;

-- Batch location lookup for the client read path (src/api/data.js merges it
-- into each event). Returns one row per requested event the caller may see at
-- all, with the location NULLed when it must stay hidden. The visibility gate
-- mirrors the events SELECT policies (anon: published only; authenticated: any;
-- plus managers/staff) so this can't leak a draft/private event's existence.
create or replace function public.get_events_location(p_event_ids uuid[])
returns table (
  event_id uuid,
  venue_name text,
  address text,
  venue_lat double precision,
  venue_lng double precision
)
language sql stable security definer set search_path = public as $$
  select
    e.id,
    case when public.can_see_event_location(e.id) then e.venue_name else null end,
    case when public.can_see_event_location(e.id) then e.address else null end,
    case when public.can_see_event_location(e.id) then e.venue_lat else null end,
    case when public.can_see_event_location(e.id) then e.venue_lng else null end
  from events e
  where e.id = any (p_event_ids)
    and (
      e.status = 'published'
      or auth.uid() is not null
      or public.is_event_staff(e.id)
    )
$$;

grant execute on function public.can_see_event_location(uuid) to anon, authenticated;
grant execute on function public.get_events_location(uuid[]) to anon, authenticated;

-- event_public_json feeds the invite landing, the logged-out preview, and the
-- home/events dashboards. Re-emit it with the location masked the same way, so
-- those paths honour the gate too. (Latest prior definition:
-- 20260916120000_event_timezone.sql — only the four location fields change.)
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
    'venue_name', case when public.can_see_event_location(e.id) then e.venue_name else null end,
    'address', case when public.can_see_event_location(e.id) then e.address else null end,
    'venue_lat', case when public.can_see_event_location(e.id) then e.venue_lat else null end,
    'venue_lng', case when public.can_see_event_location(e.id) then e.venue_lng else null end,
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
    'host_id', e.host_id,
    'hide_location_until_approved', e.hide_location_until_approved
  )
$$;
