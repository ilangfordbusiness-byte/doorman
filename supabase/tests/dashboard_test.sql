-- Dashboard RPC test suite. Run against a FRESH db (supabase db reset) —
-- suggestion totals assume no other users exist.
-- Personas: alice hosts; bob approved guest; carol invited guest + pending
-- co-host; dave = bob's friend, not attending.
\set ON_ERROR_STOP on

create temp sequence t_pass;

create function pg_temp.impersonate(uid uuid, mail text) returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'email', mail, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.go_anon() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end $$;

create function pg_temp.ok(msg text) returns void
language plpgsql security definer as $$
begin
  raise notice 'PASS %: %', lpad(nextval('pg_temp.t_pass')::text, 2, '0'), msg;
end $$;

do $test$
declare
  alice uuid := 'aaaaaaaa-1111-1111-1111-111111111111';
  bob   uuid := 'aaaaaaaa-2222-2222-2222-222222222222';
  carol uuid := 'aaaaaaaa-3333-3333-3333-333333333333';
  dave  uuid := 'aaaaaaaa-4444-4444-4444-444444444444';
  v_event uuid;
  v_bob_entry uuid;
  v_promoter uuid;
  v_tomorrow date := (now() at time zone 'Europe/London')::date + 1;
  r jsonb;
  v_count int;
begin
  -- ---- seed ----
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
         u.mail, '', now(), '{}', json_build_object('full_name', u.nm)::jsonb, now(), now()
  from (values (alice, 'alice@dash.dev', 'Alice Host'),
               (bob,   'bob@dash.dev',   'Bob Guest'),
               (carol, 'carol@dash.dev', 'Carol Invited'),
               (dave,  'dave@dash.dev',  'Dave Friend')) as u(id, mail, nm);

  insert into public.events (host_id, title, date, start_time, status, host_notes)
    values (alice, 'Rooftop Social', v_tomorrow, '20:00', 'published', 'secret note')
    returning id into v_event;

  insert into public.guestlist_entries (event_id, guest_user_id, guest_email, status, source, created_by)
    values (v_event, bob, 'bob@dash.dev', 'approved', 'manual', alice)
    returning id into v_bob_entry;
  insert into public.guestlist_entries (event_id, guest_user_id, guest_email, status, source, created_by)
    values (v_event, carol, 'carol@dash.dev', 'invited', 'manual', alice);

  -- friendships: bob-carol, bob-dave, alice-carol accepted; dave->alice pending
  insert into public.friend_requests (sender_id, receiver_id, status) values
    (bob, carol, 'accepted'), (bob, dave, 'accepted'),
    (alice, carol, 'accepted'), (dave, alice, 'pending');

  -- pending co-host invite for carol
  insert into public.event_co_hosts (event_id, email, user_id, status)
    values (v_event, 'carol@dash.dev', carol, 'pending');

  -- promoter with a known tracking code
  insert into public.promoters (event_id, name, commission_type, commission_percent, tracking_code,
                                discount_type, discount_percent, created_by)
    values (v_event, 'Promo Pete', 'percent', 10, 'pete123', 'percent', 15, alice)
    returning id into v_promoter;

  -- pending transfer: bob -> dave
  insert into public.ticket_transfers (guestlist_entry_id, event_id, sender_id, recipient_email, recipient_id)
    values (v_bob_entry, v_event, bob, 'dave@dash.dev', dave);

  -- ---- home dashboard ----
  perform pg_temp.impersonate(bob, 'bob@dash.dev');
  r := public.get_home_dashboard();
  if r -> 'event' ->> 'id' <> v_event::text then raise exception 'FAIL: bob home event wrong: %', r; end if;
  if (r ->> 'isHosting')::boolean then raise exception 'FAIL: bob is not hosting'; end if;
  if (r ->> 'attendeeCount')::int <> 2 then raise exception 'FAIL: attendeeCount %, want 2', r ->> 'attendeeCount'; end if;
  perform pg_temp.ok('home: guest sees next event with attendee count');

  if jsonb_array_length(r -> 'friendsGoing') <> 1
     or r -> 'friendsGoing' -> 0 ->> 'email' <> 'carol@dash.dev' then
    raise exception 'FAIL: friendsGoing wrong: %', r -> 'friendsGoing';
  end if;
  perform pg_temp.ok('home: friendsGoing lists attending friends only');

  if (r -> 'event') ? 'staff_code' or (r -> 'event') ? 'host_notes' or (r -> 'event') ? 'invite_code' then
    raise exception 'FAIL: protected event fields leaked: %', r -> 'event';
  end if;
  perform pg_temp.ok('home: protected event fields not in payload');

  perform pg_temp.impersonate(alice, 'alice@dash.dev');
  r := public.get_home_dashboard();
  if not (r ->> 'isHosting')::boolean then raise exception 'FAIL: alice should be hosting'; end if;
  perform pg_temp.ok('home: host sees isHosting=true');

  -- ---- guest dashboard ----
  perform pg_temp.impersonate(bob, 'bob@dash.dev');
  r := public.get_guest_dashboard();
  if jsonb_array_length(r -> 'inviteEvents') <> 1
     or r -> 'inviteEvents' -> 0 ->> 'guestStatus' <> 'approved'
     or r -> 'inviteEvents' -> 0 ->> 'entryId' <> v_bob_entry::text then
    raise exception 'FAIL: bob inviteEvents wrong: %', r -> 'inviteEvents';
  end if;
  if jsonb_array_length(r -> 'transfers' -> 'outgoing') <> 1
     or r -> 'transfers' -> 'outgoing' -> 0 ->> 'event_title' <> 'Rooftop Social' then
    raise exception 'FAIL: bob outgoing transfers wrong: %', r -> 'transfers';
  end if;
  perform pg_temp.ok('guest hub: invites + outgoing transfers resolved');

  perform pg_temp.impersonate(dave, 'dave@dash.dev');
  r := public.get_guest_dashboard();
  if jsonb_array_length(r -> 'transfers' -> 'incoming') <> 1
     or r -> 'transfers' -> 'incoming' -> 0 ->> 'sender_name' <> 'Bob Guest' then
    raise exception 'FAIL: dave incoming transfers wrong: %', r -> 'transfers';
  end if;
  perform pg_temp.ok('guest hub: incoming transfer with sender profile join');

  -- ---- notifications ----
  perform pg_temp.impersonate(carol, 'carol@dash.dev');
  r := public.get_notifications();
  if (r -> 'counts' ->> 'coHost')::int <> 1
     or (r -> 'counts' ->> 'eventInvites')::int <> 1
     or r -> 'coHostInvites' -> 0 ->> 'title' <> 'Rooftop Social'
     or r -> 'coHostInvites' -> 0 ->> 'host_name' <> 'Alice Host' then
    raise exception 'FAIL: carol notifications wrong: %', r;
  end if;
  perform pg_temp.ok('notifications: co-host invite + event invite counts');

  perform pg_temp.impersonate(alice, 'alice@dash.dev');
  r := public.get_notifications();
  if (r -> 'counts' ->> 'friendRequests')::int <> 1 then
    raise exception 'FAIL: alice friendRequests wrong: %', r;
  end if;
  perform pg_temp.ok('notifications: pending friend request count');

  -- ---- friend suggestions ----
  perform pg_temp.impersonate(bob, 'bob@dash.dev');
  r := public.get_friend_suggestions(0, 20);
  if (r ->> 'total')::int <> 1
     or r -> 'items' -> 0 ->> 'email' <> 'alice@dash.dev'
     or (r -> 'items' -> 0 ->> 'mutual')::int <> 1 then
    raise exception 'FAIL: bob suggestions wrong: %', r;
  end if;
  perform pg_temp.ok('suggestions: excludes friends/pending, ranks by mutuals (carol shared)');

  -- ---- promoter link resolution (anonymous) ----
  perform pg_temp.go_anon();
  r := public.resolve_promoter_ref(v_event, 'pete123', true);
  if not (r ->> 'valid')::boolean
     or r -> 'promoter' ->> 'name' <> 'Promo Pete'
     or (r -> 'promoter' ->> 'discount_percent')::numeric <> 15 then
    raise exception 'FAIL: promoter resolve wrong: %', r;
  end if;
  r := public.resolve_promoter_ref(v_event, 'nope', false);
  if (r ->> 'valid')::boolean then raise exception 'FAIL: bad code resolved'; end if;
  perform pg_temp.ok('promoter link: anon resolve + bad code rejected');

  execute 'reset role';
  select clicks into v_count from public.promoters where id = v_promoter;
  if v_count <> 1 then raise exception 'FAIL: click count %, want 1', v_count; end if;
  perform pg_temp.ok('promoter link: click counted once');

  raise notice '';
  raise notice 'ALL % CHECKS PASSED', currval('pg_temp.t_pass');
end $test$;
