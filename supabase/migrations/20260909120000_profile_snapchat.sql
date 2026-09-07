-- ===========================================================================
-- Add an optional Snapchat handle to profiles, shown as a clickable link
-- (https://www.snapchat.com/add/<username>) wherever a profile is viewable —
-- mirroring the existing profile `instagram` field. Column + grants here; the
-- two profile-facing RPCs are updated below to return it.
-- ===========================================================================
alter table public.profiles add column if not exists snapchat text;

-- Column-level grants are additive: add snapchat to the readable + self-editable
-- set (alongside instagram in 20260825130000_rls_policies.sql).
grant select (snapchat) on public.profiles to authenticated;
grant update (snapchat) on public.profiles to authenticated;

-- --- get_friend_suggestions: return snapchat (latest = 20260908120000) --------
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
             'snapchat', s.snapchat, 'mutual', s.mutual) order by s.rn)
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
    select p.email, p.full_name, p.avatar_url, p.instagram, p.snapchat,
           coalesce(m.n, 0)::int as mutual,
           row_number() over (order by
                                coalesce(m.n, 0) desc,
                                (p.avatar_url is not null and p.avatar_url <> '') desc,
                                md5(p.id::text || v_uid::text || current_date::text)) as rn
    from profiles p
    left join mutuals m on m.cand = p.id
    where p.id <> v_uid
      and p.id not in (select other from my_edges)
      and p.email <> 'akshay.irudayaraj+dm-host@gmail.com'  -- hide Smoke host seed account
      and p.email not like '%@deleted.doorman'              -- hide deleted accounts
  ) s;

  return jsonb_build_object(
    'items', v_items, 'total', v_total,
    'hasMore', v_offset + v_limit < v_total, 'offset', v_offset);
end $$;

-- --- get_event_attendees: return snapchat (latest = 20260905120000) -----------
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

  with distinct_att as (
    select distinct on (lower(g.guest_email))
      g.guest_email as email,
      regexp_replace(coalesce(g.guest_name, g.guest_email), '\s*\(\d+ of \d+\)$', '') as name,
      p.avatar_url, p.instagram, p.snapchat, g.status
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
    'instagram', instagram, 'snapchat', snapchat, 'status', status) order by name), '[]'::jsonb)
  into v_attendees from page;

  return jsonb_build_object(
    'visibility', 'show_names',
    'going_count', v_count,
    'attendees', v_attendees);
end $$;
