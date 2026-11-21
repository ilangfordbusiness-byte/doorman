-- Link previews for shared /dj/:id links.
--
-- Link-unfurling crawlers (iMessage, WhatsApp, ...) fetch the page signed out,
-- and anon can't read profiles or event_dj_lineup. api/og.js calls this with
-- the anon key to label the link as that DJ's profile.
--
-- Tiny privileged lookup: returns only what the public DJ page shows (name,
-- photo, bio, genres, counts of public gigs), and only for someone billed on
-- at least one public, published event's lineup. Anyone else gets null, so
-- this can't be used to look up arbitrary users by id.
create or replace function public.get_dj_link_preview(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with gigs as (
    select e.date
    from event_dj_lineup l
    join events e on e.id = l.event_id
    where l.dj_user_id = p_id
      and e.status = 'published'
      and e.is_public
  )
  select jsonb_build_object(
           'name', nullif(btrim(p.full_name), ''),
           'avatar_url', p.avatar_url,
           'bio', p.bio,
           'genres', p.genres,
           'upcoming', (select count(*) from gigs where date >= current_date),
           'past', (select count(*) from gigs where date < current_date))
  from profiles p
  where p.id = p_id
    and exists (select 1 from gigs);
$$;

revoke all on function public.get_dj_link_preview(uuid) from public;
grant execute on function public.get_dj_link_preview(uuid) to anon, authenticated, service_role;
