-- ===========================================================================
-- Keep deleted accounts out of friend suggestions.
--
-- Account deletion anonymises the profile (deleteAccount): full_name becomes
-- 'Deleted user' and the email is tombstoned to deleted+<id>@deleted.doorman.
-- Those rows should never be offered as friend suggestions.
--
-- Reproduces get_friend_suggestions from 20260901130000 verbatim, adding a
-- predicate that drops tombstoned (deleted) profiles.
-- ===========================================================================
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
             'mutual', s.mutual) order by s.rn)
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
    select p.email, p.full_name, p.avatar_url, p.instagram,
           coalesce(m.n, 0)::int as mutual,
           row_number() over (order by coalesce(m.n, 0) desc, p.full_name asc) as rn
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
