-- ===========================================================================
-- Logged-out event preview.
--
-- Signed-out visitors who open a shared event link now see a read-only preview
-- (and sign up only when they try to join). Anon can already SELECT a published
-- event's core fields and ticket tiers via RLS, but the host's name/photo, the
-- DJ lineup and the co-hosts come from profiles / event_dj_lineup /
-- event_co_hosts, which are authenticated-only. These security-definer reads
-- return just the public display shape for those, so the preview is complete.
--
-- Privacy: get_event_people only serves PUBLIC published events (public links
-- preview public events). A private event's people ride along inside
-- get_event_by_invite, which already requires the event's secret invite code.
-- ===========================================================================

-- Shared builder: the host display (business or individual), DJ lineup and
-- co-hosts for an event, mirroring the app's Event.toApp shape (including its
-- "hide deleted accounts" fallbacks). SECURITY DEFINER so it can read the
-- authenticated-only relations; never granted to clients directly — only the
-- two wrapper functions below call it.
create or replace function public.event_people_json(e public.events)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'host_is_business', e.business_id is not null,
    'host_name', coalesce(
      case when e.business_id is not null
           then (select bp.business_name from business_public bp where bp.id = e.business_id)
           else (select p.full_name from profiles p
                 where p.id = e.host_id and p.email not like '%@deleted.doorman')
      end, ''),
    'host_picture', coalesce(
      case when e.business_id is not null
           then (select bp.business_picture_url from business_public bp where bp.id = e.business_id)
           else (select p.avatar_url from profiles p
                 where p.id = e.host_id and p.email not like '%@deleted.doorman')
      end, ''),
    'host_email', case when e.business_id is not null then null
      else (select p.email from profiles p
            where p.id = e.host_id and p.email not like '%@deleted.doorman') end,
    'dj_lineup', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'user_id', case when pr.email like '%@deleted.doorman' then null else d.dj_user_id end,
        'name', case when pr.email like '%@deleted.doorman' then d.dj_name
                     else coalesce(pr.full_name, d.dj_name) end,
        'picture', case when pr.email like '%@deleted.doorman' then '' else coalesce(pr.avatar_url, '') end,
        'set_time', coalesce(d.set_time, ''),
        'sort_order', coalesce(d.sort_order, 0)
      ) order by coalesce(d.sort_order, 0))
      from event_dj_lineup d left join profiles pr on pr.id = d.dj_user_id
      where d.event_id = e.id
    ), '[]'::jsonb),
    'co_hosts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'email', c.email,
        'name', coalesce(pr.full_name, c.email),
        'picture', coalesce(pr.avatar_url, ''),
        'status', c.status
      ))
      from event_co_hosts c left join profiles pr on pr.id = c.user_id
      where c.event_id = e.id
        and (pr.id is null or pr.email not like '%@deleted.doorman')
    ), '[]'::jsonb)
  )
$$;
revoke execute on function public.event_people_json(public.events) from public, anon, authenticated;

-- Public read for the /event/:id preview: host/DJ/co-host display for a PUBLIC
-- published event only. Private events never surface here — they preview via
-- their invite code (get_event_by_invite below).
create or replace function public.get_event_people(p_event_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select public.event_people_json(e)
  from public.events e
  where e.id = p_event_id and e.status = 'published' and e.is_public;
$$;
revoke execute on function public.get_event_people(uuid) from public;
grant execute on function public.get_event_people(uuid) to anon, authenticated;

-- Private preview: the invite link already carries the event's secret code, so
-- fold the people display into its payload (also fixes the invite page showing
-- a blank host name). Redefined identically to 20260825180000 plus the merge.
create or replace function public.get_event_by_invite(p_invite_code text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_event events%rowtype;
begin
  select * into v_event from events
    where invite_code = p_invite_code and status <> 'draft';
  if not found then
    return null;
  end if;
  return public.event_public_json(v_event)
    || public.event_people_json(v_event)
    || jsonb_build_object('invite_code', p_invite_code);
end $$;
grant execute on function public.get_event_by_invite(text) to anon, authenticated;
