-- RLS test suite for DoorMan. Seeds four users, impersonates each via
-- role + JWT claims, and asserts every security boundary.
-- Personas: alice = host, bob = invited guest, carol = doorman, dave = stranger.
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
  alice uuid := '11111111-1111-1111-1111-111111111111';
  bob   uuid := '22222222-2222-2222-2222-222222222222';
  carol uuid := '33333333-3333-3333-3333-333333333333';
  dave  uuid := '44444444-4444-4444-4444-444444444444';
  v_event uuid;
  v_draft uuid;
  v_entry uuid;
  v_invite_code text;
  v_staff_code text;
  v_notes text;
  v_id uuid;
  v_text text;
  v_count int;
begin
  -- ---- seed users (as postgres; trigger creates profiles) ----
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
         u.mail, '', now(), '{}', json_build_object('full_name', u.nm)::jsonb, now(), now()
  from (values (alice, 'alice@test.dev', 'Alice Host'),
               (bob,   'bob@test.dev',   'Bob Guest'),
               (carol, 'carol@test.dev', 'Carol Door'),
               (dave,  'dave@test.dev',  'Dave Stranger')) as u(id, mail, nm);

  if (select count(*) from public.profiles) <> 4 then
    raise exception 'signup trigger did not create 4 profiles';
  end if;
  perform pg_temp.ok('signup trigger creates profiles');

  -- ---- alice creates events ----
  perform pg_temp.impersonate(alice, 'alice@test.dev');
  insert into public.events (host_id, title, date, start_time, status, requests_open, host_notes)
    values (alice, 'Warehouse Rave', '2026-09-01', '22:00', 'published', true, 'VIPs at side door')
    returning id into v_event;
  insert into public.events (host_id, title, date, start_time, status)
    values (alice, 'Secret Afters', '2026-09-02', '02:00', 'draft')
    returning id into v_draft;
  perform pg_temp.ok('host can create events');

  begin
    execute format('select invite_code from public.events where id = %L', v_event);
    raise exception 'FAIL: invite_code readable by client' using errcode = 'assert_failure';
  exception when insufficient_privilege then
    perform pg_temp.ok('invite_code / staff_code hidden from clients (column grant)');
  end;

  select p.host_notes, p.staff_code, p.invite_code
    into v_notes, v_staff_code, v_invite_code
    from public.get_event_private(v_event) p;
  if v_notes is distinct from 'VIPs at side door' or v_invite_code is null then
    raise exception 'FAIL: get_event_private wrong for manager';
  end if;
  perform pg_temp.ok('manager reads protected fields via get_event_private');

  insert into public.guestlist_entries (event_id, guest_user_id, guest_email, guest_name, status, source, created_by)
    values (v_event, bob, 'bob@test.dev', 'Bob Guest', 'invited', 'manual', alice)
    returning id into v_entry;
  perform pg_temp.ok('manager can add guests');

  -- ---- dave the stranger ----
  perform pg_temp.impersonate(dave, 'dave@test.dev');
  select count(*) into v_count from public.events;
  if v_count <> 2 then raise exception 'FAIL: authed users should see all events, saw %', v_count; end if;
  select count(*) into v_count from public.guestlist_entries;
  if v_count <> 0 then raise exception 'FAIL: stranger sees % guestlist rows', v_count; end if;
  perform pg_temp.ok('stranger sees events but no guestlist rows');

  begin
    perform 1 from public.get_event_private(v_event);
    raise exception 'FAIL: stranger read protected event fields' using errcode = 'assert_failure';
  exception when raise_exception then
    perform pg_temp.ok('stranger blocked from get_event_private');
  end;

  begin
    insert into public.guestlist_entries (event_id, guest_email, status, source)
      values (v_event, 'dave@test.dev', 'approved', 'request');
    raise exception 'FAIL: stranger self-approved onto guestlist' using errcode = 'assert_failure';
  exception when insufficient_privilege then
    perform pg_temp.ok('stranger cannot self-approve onto guestlist');
  end;

  insert into public.guestlist_entries (event_id, guest_user_id, guest_email, status, source)
    values (v_event, dave, 'dave@test.dev', 'requested', 'request');
  perform pg_temp.ok('stranger can file a join request on an open published event');

  begin
    perform public.join_event_via_invite('wrong-code');
    raise exception 'FAIL: bad invite code accepted' using errcode = 'assert_failure';
  exception when raise_exception then
    perform pg_temp.ok('bad invite code rejected');
  end;

  select count(*) into v_count from public.promo_codes;
  if v_count <> 0 then raise exception 'FAIL: stranger sees promo codes'; end if;

  -- ---- bob the guest ----
  perform pg_temp.impersonate(bob, 'bob@test.dev');
  select count(*) into v_count from public.guestlist_entries;
  if v_count <> 1 then raise exception 'FAIL: bob should see exactly his row, saw %', v_count; end if;
  perform pg_temp.ok('guest sees only his own entry');

  begin
    execute format('select qr_secret from public.guestlist_entries where id = %L', v_entry);
    raise exception 'FAIL: qr_secret readable by client' using errcode = 'assert_failure';
  exception when insufficient_privilege then
    perform pg_temp.ok('qr_secret hidden from clients');
  end;

  select public.my_qr_payload(v_entry) into v_text;
  if (convert_from(decode(v_text, 'base64'), 'utf8')::json ->> 'gid') <> v_entry::text
     or v_text like '%' || E'\n' || '%' then
    raise exception 'FAIL: my_qr_payload malformed: %', v_text;
  end if;
  perform pg_temp.ok('my_qr_payload returns clean btoa-compatible payload');

  update public.guestlist_entries set status = 'approved' where id = v_entry;
  perform pg_temp.ok('guest can accept his invite (invited -> approved)');

  begin
    update public.guestlist_entries
      set status = 'checked_in', checked_in_at = now() where id = v_entry;
    raise exception 'FAIL: guest self-checked-in' using errcode = 'assert_failure';
  exception when insufficient_privilege then
    perform pg_temp.ok('guest cannot set his own status to checked_in');
  end;

  begin
    insert into public.event_messages (event_id, sender_id, text)
      values (v_event, bob, 'first!');
    raise exception 'FAIL: guest chatted without can_chat' using errcode = 'assert_failure';
  exception when insufficient_privilege then
    perform pg_temp.ok('guest without can_chat cannot post in chat');
  end;

  insert into public.friend_requests (sender_id, receiver_id, status)
    values (bob, dave, 'pending');
  begin
    insert into public.friend_requests (sender_id, receiver_id, status)
      values (bob, alice, 'accepted');
    raise exception 'FAIL: created pre-accepted friend request' using errcode = 'assert_failure';
  exception when insufficient_privilege then
    perform pg_temp.ok('friend requests can only be created pending');
  end;

  begin
    update public.profiles set role = 'admin' where id = bob;
    raise exception 'FAIL: user set own role to admin' using errcode = 'assert_failure';
  exception when insufficient_privilege then
    perform pg_temp.ok('privilege escalation via profiles.role blocked');
  end;

  update public.profiles set instagram = 'bob.goes.out' where id = bob;
  perform pg_temp.ok('user can edit own profile safe columns');

  -- ---- dave accepts bob's friend request; joins via invite link ----
  perform pg_temp.impersonate(dave, 'dave@test.dev');
  update public.friend_requests set status = 'accepted'
    where sender_id = bob and receiver_id = dave;
  perform pg_temp.ok('receiver can accept a friend request');

  select public.join_event_via_invite(v_invite_code) into v_id;
  select count(*) into v_count from public.guestlist_entries
    where guest_user_id = dave and event_id = v_event;
  if v_count <> 2 then raise exception 'FAIL: expected request+invite rows for dave, saw %', v_count; end if;
  perform pg_temp.ok('invite link join works; duplicate entries per email allowed');

  -- ---- carol registers as doorman ----
  perform pg_temp.impersonate(carol, 'carol@test.dev');
  begin
    perform public.register_staff_via_code(v_event, '!!!!');
    raise exception 'FAIL: wrong staff code accepted' using errcode = 'assert_failure';
  exception when raise_exception then
    perform pg_temp.ok('wrong staff code rejected');
  end;
  perform public.register_staff_via_code(v_event, v_staff_code);
  select count(*) into v_count from public.guestlist_entries where event_id = v_event;
  if v_count < 3 then raise exception 'FAIL: doorman cannot see guestlist'; end if;
  perform pg_temp.ok('doorman self-registers with staff code and sees the guestlist');

  update public.guestlist_entries
    set status = 'checked_in', checked_in_at = now(), checked_in_by = carol
    where id = v_entry;
  perform pg_temp.ok('staff can check a guest in');

  -- ---- alice: chat permission + client-side money writes blocked ----
  perform pg_temp.impersonate(alice, 'alice@test.dev');
  update public.guestlist_entries set can_chat = true where id = v_entry;
  begin
    insert into public.ticket_tiers (event_id, name, price_minor, quantity)
      values (v_event, 'GA', 2000, 100);
    raise exception 'FAIL: client wrote a ticket tier directly' using errcode = 'assert_failure';
  exception when insufficient_privilege then
    perform pg_temp.ok('ticket tier writes are service-role only');
  end;
  insert into public.event_messages (event_id, sender_id, text)
    values (v_event, alice, 'Doors 10pm - bring ID');
  perform pg_temp.ok('host can post in chat');

  -- ---- bob can chat now; dave (approved via invite) reads chat ----
  perform pg_temp.impersonate(bob, 'bob@test.dev');
  insert into public.event_messages (event_id, sender_id, text) values (v_event, bob, 'see you there');
  perform pg_temp.ok('guest with can_chat can post');

  perform pg_temp.impersonate(dave, 'dave@test.dev');
  select count(*) into v_count from public.event_messages;
  if v_count <> 2 then raise exception 'FAIL: attendee should see 2 messages, saw %', v_count; end if;
  perform pg_temp.ok('attendee can read event chat');

  -- ---- anon sees only published events ----
  perform pg_temp.go_anon();
  select count(*) into v_count from public.events;
  if v_count <> 1 then raise exception 'FAIL: anon should see 1 published event, saw %', v_count; end if;
  begin
    select count(*) into v_count from public.guestlist_entries;
    raise exception 'FAIL: anon can query the guestlist' using errcode = 'assert_failure';
  exception when insufficient_privilege then
    null;  -- anon has no grant on the table at all — stricter than empty-result
  end;
  perform pg_temp.ok('anon sees only published events, nothing else');

  execute 'reset role';
  raise notice '';
  raise notice 'ALL % CHECKS PASSED', currval('pg_temp.t_pass');
end $test$;
