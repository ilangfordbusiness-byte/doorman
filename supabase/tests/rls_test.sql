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
  v_biz uuid;
  v_member uuid;
  v_biz_event uuid;
  v_json jsonb;
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

  if (select count(*) from public.profiles where email like '%@test.dev') <> 4 then
    raise exception 'signup trigger did not create 4 profiles';
  end if;
  perform pg_temp.ok('signup trigger creates profiles');

  -- signup metadata (phone + instagram) is copied into the profile by the trigger
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000',
          '66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated',
          'meta@signup.dev', '', now(), '{}',
          json_build_object('full_name', 'Meta User', 'phone', '+447700900123', 'instagram', 'metahandle')::jsonb,
          now(), now());
  if (select phone from public.profiles where email = 'meta@signup.dev') is distinct from '+447700900123'
     or (select instagram from public.profiles where email = 'meta@signup.dev') is distinct from 'metahandle' then
    raise exception 'FAIL: signup trigger did not copy phone/instagram from metadata';
  end if;
  perform pg_temp.ok('signup trigger copies phone + instagram from metadata');

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
  select count(*) into v_count from public.events where host_id = alice;
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
  exception when insufficient_privilege or check_violation then
    perform pg_temp.ok('guest cannot set his own status to checked_in');
  end;

  begin
    insert into public.event_messages (event_id, sender_id, text)
      values (v_event, bob, 'first!');
    raise exception 'FAIL: guest posted in chat' using errcode = 'assert_failure';
  exception when insufficient_privilege then
    perform pg_temp.ok('guest cannot post in chat');
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

  update public.profiles set avatar_prompt_dismissed_at = now() where id = bob;
  perform pg_temp.ok('user can dismiss own avatar prompt');

  update public.profiles set location = 'London, UK' where id = bob;
  perform pg_temp.ok('user can set own profile location');

  begin
    update public.profiles set location = repeat('x', 101) where id = bob;
    raise exception 'FAIL: user set a 101-char location' using errcode = 'assert_failure';
  exception when check_violation then
    perform pg_temp.ok('profile location is capped at 100 chars (check constraint)');
  end;

  -- stripe_account_country / stripe_default_currency are facts copied from
  -- Stripe by the service role; a client must never be able to set them.
  begin
    update public.profiles set stripe_account_country = 'US' where id = bob;
    raise exception 'FAIL: user set own stripe_account_country' using errcode = 'assert_failure';
  exception when insufficient_privilege then
    perform pg_temp.ok('stripe account facts are server-only (column grant)');
  end;

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

  -- ---- single-use: bob cannot resurrect or forge his own check-in ----
  perform pg_temp.impersonate(bob, 'bob@test.dev');
  begin
    update public.guestlist_entries
      set status = 'approved', checked_in_at = null, checked_in_by = null
      where id = v_entry;
    raise exception 'FAIL: guest reset his own check-in (QR reuse)' using errcode = 'assert_failure';
  exception when check_violation then
    perform pg_temp.ok('guest cannot reset a checked-in ticket back to approved');
  end;
  begin
    update public.guestlist_entries set checked_in_by = bob where id = v_entry;
    raise exception 'FAIL: guest forged the check-in stamp' using errcode = 'assert_failure';
  exception when check_violation then
    perform pg_temp.ok('guest cannot forge checked_in_by/at on his own ticket');
  end;
  begin
    update public.guestlist_entries set plus_one = true, plus_one_name = 'Gatecrasher' where id = v_entry;
    raise exception 'FAIL: guest granted himself a plus-one' using errcode = 'assert_failure';
  exception when check_violation then
    perform pg_temp.ok('guest cannot grant himself a plus-one');
  end;
  -- The geofence auto-checkout still works: owner writes checked_out_at while
  -- the ticket stays checked_in.
  update public.guestlist_entries set checked_out_at = now() where id = v_entry;
  select status into v_text from public.guestlist_entries where id = v_entry;
  if v_text <> 'checked_in' then raise exception 'FAIL: geofence checkout altered status'; end if;
  perform pg_temp.ok('guest can still set checked_out_at on a checked-in ticket (geofence)');

  -- Staff can still correct a check-in (e.g. accidental scan).
  perform pg_temp.impersonate(carol, 'carol@test.dev');
  update public.guestlist_entries
    set status = 'approved', checked_in_at = null, checked_in_by = null, checked_out_at = null
    where id = v_entry;
  update public.guestlist_entries
    set status = 'checked_in', checked_in_at = now(), checked_in_by = carol
    where id = v_entry;
  perform pg_temp.ok('staff can still reset and re-check-in a ticket');
  update public.guestlist_entries set plus_one = true, plus_one_name = 'Plus One' where id = v_entry;
  perform pg_temp.ok('staff can grant a plus-one');

  -- ---- alice: host chat + client-side money writes blocked ----
  perform pg_temp.impersonate(alice, 'alice@test.dev');
  update public.guestlist_entries set can_chat = true where id = v_entry;  -- legacy flag, grants nothing
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

  -- ---- chat is host-only: can_chat no longer lets bob post; dave reads ----
  perform pg_temp.impersonate(bob, 'bob@test.dev');
  begin
    insert into public.event_messages (event_id, sender_id, text) values (v_event, bob, 'see you there');
    raise exception 'FAIL: guest posted in chat via can_chat' using errcode = 'assert_failure';
  exception when insufficient_privilege then
    perform pg_temp.ok('can_chat no longer lets a guest post (chat is host-only)');
  end;

  perform pg_temp.impersonate(dave, 'dave@test.dev');
  select count(*) into v_count from public.event_messages where event_id = v_event;
  if v_count <> 1 then raise exception 'FAIL: attendee should see 1 message, saw %', v_count; end if;
  perform pg_temp.ok('attendee can read event chat');

  -- ---- anon sees only published events ----
  perform pg_temp.go_anon();
  select count(*) into v_count from public.events where id in (v_event, v_draft);
  if v_count <> 1 then raise exception 'FAIL: anon should see 1 published event, saw %', v_count; end if;
  begin
    select count(*) into v_count from public.guestlist_entries;
    raise exception 'FAIL: anon can query the guestlist' using errcode = 'assert_failure';
  exception when insufficient_privilege then
    null;  -- anon has no grant on the table at all — stricter than empty-result
  end;
  perform pg_temp.ok('anon sees only published events, nothing else');

  -- ---- staff added by phone: access + backlink ----
  perform pg_temp.impersonate(alice, 'alice@test.dev');
  insert into public.event_staff (event_id, phone, name, role, created_by)
    values (v_event, public.normalize_phone('07700 900999'), 'Phone Doorman A', 'doorman', alice);

  -- dave has no profile phone yet: the row must be invisible to him
  perform pg_temp.impersonate(dave, 'dave@test.dev');
  select count(*) into v_count from public.event_staff where event_id = v_event;
  if v_count <> 0 then raise exception 'FAIL: phone staff row leaked pre-phone, saw %', v_count; end if;
  perform pg_temp.ok('phone-added staff row hidden until the phone is claimed');

  -- setting dave's phone back-links the pre-existing row (trigger)
  execute 'reset role';
  update public.profiles set phone = public.normalize_phone('07700900999') where id = dave;
  if (select user_id from public.event_staff
      where event_id = v_event and phone = '+447700900999') is distinct from dave then
    raise exception 'FAIL: phone staff row not back-linked to dave';
  end if;
  perform pg_temp.ok('profile phone write back-links pre-signup staff rows');

  -- a phone-only row added AFTER the claim stays user_id-less: the policy's
  -- phone arm alone must make it (and staff access) work
  perform pg_temp.impersonate(alice, 'alice@test.dev');
  insert into public.event_staff (event_id, phone, name, role, created_by)
    values (v_event, '+447700900999', 'Phone Doorman B', 'doorman', alice);
  perform pg_temp.impersonate(dave, 'dave@test.dev');
  select count(*) into v_count from public.event_staff where event_id = v_event;
  if v_count <> 2 then raise exception 'FAIL: dave should see both staff rows, saw %', v_count; end if;
  select count(*) into v_count from public.guestlist_entries where event_id = v_event;
  if v_count < 3 then raise exception 'FAIL: phone doorman cannot see guestlist, saw %', v_count; end if;
  perform pg_temp.ok('staff matched by phone sees roster rows and the guestlist');

  -- ---- admin ----
  execute 'reset role';

  -- the signup trigger promotes the one bootstrap email to admin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000',
          '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated',
          'ilangfordbusiness@gmail.com', '', now(), '{}',
          json_build_object('full_name', 'Owner')::jsonb, now(), now());
  if (select role from public.profiles where email = 'ilangfordbusiness@gmail.com') <> 'admin' then
    raise exception 'FAIL: bootstrap email was not promoted to admin';
  end if;
  -- ...and the second bootstrap email (20260910120000_second_super_admin.sql)
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000',
          '77777777-7777-7777-7777-777777777777', 'authenticated', 'authenticated',
          'akshay.irudayaraj@gmail.com', '', now(), '{}',
          json_build_object('full_name', 'Second Admin')::jsonb, now(), now());
  if (select role from public.profiles where email = 'akshay.irudayaraj@gmail.com') <> 'admin' then
    raise exception 'FAIL: second bootstrap email was not promoted to admin';
  end if;
  perform pg_temp.ok('signup trigger promotes both bootstrap emails to admin');

  -- a normal user can never self-grant the role or banned_at columns
  -- (this is what keeps the in-app PIN unlock inert)
  perform pg_temp.impersonate(dave, 'dave@test.dev');
  begin
    update public.profiles set role = 'admin' where id = dave;
    raise exception 'FAIL: authenticated could update role' using errcode = 'assert_failure';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set banned_at = now() where id = dave;
    raise exception 'FAIL: authenticated could update banned_at' using errcode = 'assert_failure';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.ok('authenticated cannot self-grant role or banned_at');

  -- seed an audit row as postgres, then confirm a non-admin sees none of it
  execute 'reset role';
  insert into public.admin_audit_log (admin_id, admin_email, action, target_type, target_id)
    values (alice, 'alice@test.dev', 'test', 'profile', dave::text);

  perform pg_temp.impersonate(dave, 'dave@test.dev');
  select count(*) into v_count from public.admin_audit_log;
  if v_count <> 0 then raise exception 'FAIL: non-admin saw % audit rows', v_count; end if;
  begin
    perform public.admin_dashboard_metrics();
    raise exception 'FAIL: non-admin ran admin_dashboard_metrics' using errcode = 'assert_failure';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.ok('non-admin cannot read the audit log or run admin metrics');

  -- an admin can read the audit log and run the metrics aggregate
  execute 'reset role';
  update public.profiles set role = 'admin' where id = alice;
  perform pg_temp.impersonate(alice, 'alice@test.dev');
  if not public.is_admin() then raise exception 'FAIL: alice should be admin'; end if;
  select count(*) into v_count from public.admin_audit_log;
  if v_count < 1 then raise exception 'FAIL: admin cannot read the audit log'; end if;
  perform public.admin_dashboard_metrics();
  perform pg_temp.ok('admin can read the audit log and run metrics');
  if jsonb_typeof(public.admin_dashboard_metrics() -> 'by_currency') <> 'array' then
    raise exception 'FAIL: metrics lack per-currency totals' using errcode = 'assert_failure';
  end if;
  perform pg_temp.ok('admin metrics report money per currency');

  -- ---- ticket reservations (service-role RPCs, run as postgres) ----
  execute 'reset role';
  insert into public.ticket_tiers (event_id, name, price_minor, quantity)
    values (v_event, 'Scarce', 500, 2) returning id into v_id;

  begin
    perform pg_temp.impersonate(bob, 'bob@test.dev');
    perform public.reserve_tier_seats(v_id, 1);
    raise exception 'FAIL: client called reserve_tier_seats' using errcode = 'assert_failure';
  exception when insufficient_privilege then
    execute 'reset role';
    perform pg_temp.ok('reserve_tier_seats is service-role only');
  end;

  if not public.reserve_tier_seats(v_id, 1) then raise exception 'FAIL: first reservation refused'; end if;
  if not public.reserve_tier_seats(v_id, 1) then raise exception 'FAIL: second reservation refused'; end if;
  if public.reserve_tier_seats(v_id, 1) then raise exception 'FAIL: reserved past capacity'; end if;
  if (select reserved from public.ticket_tiers where id = v_id) <> 2 then
    raise exception 'FAIL: reserved counter wrong';
  end if;
  perform pg_temp.ok('reservations stop exactly at capacity');

  -- one hold turns into a sale, the other is released: 1 sold, 1 free
  perform public.record_tier_sale(v_id, 1);
  perform public.release_tier_seats(v_id, 1);
  if (select sold from public.ticket_tiers where id = v_id) <> 1
     or (select reserved from public.ticket_tiers where id = v_id) <> 0 then
    raise exception 'FAIL: sale/release did not update counters';
  end if;
  if not public.reserve_tier_seats(v_id, 1) then raise exception 'FAIL: freed seat not reservable'; end if;
  perform pg_temp.ok('a sale consumes its hold and a release frees the seat');

  -- the sweep cancels a pending order past its deadline and frees its seat
  insert into public.ticket_orders (event_id, tier_id, guest_user_id, guest_email, quantity,
                                    unit_price_minor, paid_minor, status, expires_at)
    values (v_event, v_id, bob, 'bob@test.dev', 1, 500, 500, 'pending', now() - interval '10 minutes');
  if public.expire_stale_ticket_orders() <> 1 then raise exception 'FAIL: sweep did not cancel the stale order'; end if;
  if (select count(*) from public.ticket_orders where tier_id = v_id and status = 'cancelled') <> 1
     or (select reserved from public.ticket_tiers where id = v_id) <> 0 then
    raise exception 'FAIL: sweep did not release the seat';
  end if;
  if public.expire_stale_ticket_orders() <> 0 then raise exception 'FAIL: sweep is not idempotent'; end if;
  perform pg_temp.ok('stale pending orders are cancelled once and their seats freed');

  begin
    update public.ticket_tiers set sold = 3 where id = v_id;
    raise exception 'FAIL: sold + reserved exceeded quantity' using errcode = 'assert_failure';
  exception when check_violation then
    perform pg_temp.ok('sold + reserved <= quantity is enforced by the database');
  end;

  -- ---- optional tier description ----
  begin
    update public.ticket_tiers set description = repeat('x', 281) where id = v_id;
    raise exception 'FAIL: over-long tier description accepted' using errcode = 'assert_failure';
  exception when check_violation then
    perform pg_temp.ok('tier descriptions are capped at 280 characters by the database');
  end;
  update public.ticket_tiers set description = 'Includes a welcome drink' where id = v_id;
  perform pg_temp.impersonate(bob, 'bob@test.dev');
  if (select description from public.ticket_tiers where id = v_id) is distinct from 'Includes a welcome drink' then
    raise exception 'FAIL: guest cannot read the tier description' using errcode = 'assert_failure';
  end if;
  execute 'reset role';
  perform pg_temp.ok('guests can read tier descriptions');

  -- ---- Meta ads tracking: pixel public, token write-only ----
  perform pg_temp.impersonate(alice, 'alice@test.dev');
  insert into public.business_accounts (owner_id, business_email, business_name)
    values (alice, 'biz@test.dev', 'Alice Events Ltd') returning id into v_id;
  update public.business_accounts
    set meta_pixel_id = '123456789012345', meta_capi_token = 'EAAB-secret-token',
        meta_test_event_code = 'TEST123'
    where id = v_id;
  if (select meta_capi_token_set from public.business_accounts where id = v_id) is not true then
    raise exception 'FAIL: meta_capi_token_set flag not readable/true after saving a token';
  end if;
  perform pg_temp.ok('business manager can save Meta pixel + token');

  begin
    execute format('select meta_capi_token from public.business_accounts where id = %L', v_id);
    raise exception 'FAIL: meta_capi_token readable by client' using errcode = 'assert_failure';
  exception when insufficient_privilege then
    perform pg_temp.ok('meta_capi_token hidden from clients (column grant)');
  end;

  begin
    update public.business_accounts set meta_pixel_id = 'not-a-pixel' where id = v_id;
    raise exception 'FAIL: malformed pixel id accepted' using errcode = 'assert_failure';
  exception when check_violation then
    perform pg_temp.ok('pixel id must be numeric');
  end;

  perform pg_temp.impersonate(dave, 'dave@test.dev');
  update public.business_accounts set meta_capi_token = 'hijack' where id = v_id;
  execute 'reset role';
  if (select meta_capi_token from public.business_accounts where id = v_id) <> 'EAAB-secret-token' then
    raise exception 'FAIL: stranger overwrote the Meta token';
  end if;
  perform pg_temp.ok('stranger cannot change another business''s Meta settings');

  perform pg_temp.go_anon();
  if (select meta_pixel_id from public.business_public where id = v_id) <> '123456789012345' then
    raise exception 'FAIL: pixel id not visible via business_public';
  end if;
  perform pg_temp.ok('pixel id is readable by anon via business_public');

  perform pg_temp.impersonate(alice, 'alice@test.dev');
  begin
    perform * from public.ticket_order_tracking;
    raise exception 'FAIL: ticket_order_tracking readable by client' using errcode = 'assert_failure';
  exception when insufficient_privilege then
    perform pg_temp.ok('ticket_order_tracking (browser match keys) is service-role only');
  end;

  -- ---- business members: owner-only management, member access, invites ----
  perform pg_temp.impersonate(alice, 'alice@test.dev');
  insert into public.business_accounts (owner_id, business_email, business_name)
    values (alice, 'team@test.dev', 'Team Events Ltd') returning id into v_biz;

  -- owner invites bob (existing user) and a stranger with no account yet
  insert into public.business_members (business_id, email, user_id, status)
    values (v_biz, 'bob@test.dev', bob, 'pending') returning id into v_member;
  insert into public.business_members (business_id, email, status)
    values (v_biz, 'newbie@test.dev', 'pending');
  perform pg_temp.ok('owner can invite business members');

  -- pending invitee sees the invite (own row + notifications) but not the business
  perform pg_temp.impersonate(bob, 'bob@test.dev');
  select count(*) into v_count from public.business_members where business_id = v_biz;
  if v_count <> 1 then
    raise exception 'FAIL: pending invitee sees % member rows, expected only their own', v_count;
  end if;
  v_json := public.get_notifications();
  if (v_json -> 'counts' ->> 'businessInvite')::int <> 1
     or (v_json -> 'businessInvites' -> 0 ->> 'business_id')::uuid <> v_biz then
    raise exception 'FAIL: pending business invite missing from get_notifications';
  end if;
  select count(*) into v_count from public.business_accounts where id = v_biz;
  if v_count <> 0 then
    raise exception 'FAIL: pending invitee can read the business account';
  end if;
  perform pg_temp.ok('pending invitee sees their invite but not the business');

  begin
    insert into public.events (host_id, business_id, title, date, start_time, status)
      values (bob, v_biz, 'Not Mine', '2026-10-01', '20:00', 'draft');
    raise exception 'FAIL: non-member created an event under a business' using errcode = 'assert_failure';
  exception when insufficient_privilege then
    perform pg_temp.ok('non-member cannot create events under a business');
  end;

  -- accept (the acceptBusinessMember edge function does this with the service role)
  execute 'reset role';
  update public.business_members set status = 'accepted' where id = v_member;

  perform pg_temp.impersonate(bob, 'bob@test.dev');
  select count(*) into v_count from public.business_accounts where id = v_biz;
  if v_count <> 1 then
    raise exception 'FAIL: accepted member cannot read the business account';
  end if;
  update public.business_accounts set description = 'Run by the team' where id = v_biz;
  execute 'reset role';
  if (select description from public.business_accounts where id = v_biz) <> 'Run by the team' then
    raise exception 'FAIL: accepted member could not edit the business';
  end if;
  perform pg_temp.ok('accepted member can read + edit the business account');

  perform pg_temp.impersonate(bob, 'bob@test.dev');
  insert into public.events (host_id, business_id, title, date, start_time, status)
    values (bob, v_biz, 'Team Night', '2026-10-02', '21:00', 'published')
    returning id into v_biz_event;
  select count(*) into v_count from public.business_members where business_id = v_biz;
  if v_count <> 2 then
    raise exception 'FAIL: accepted member sees % team rows, expected 2', v_count;
  end if;
  perform pg_temp.ok('accepted member can create business events and see the team');

  -- the owner manages any event under the business, even one a member created
  perform pg_temp.impersonate(alice, 'alice@test.dev');
  update public.events set title = 'Team Night (renamed)' where id = v_biz_event;
  execute 'reset role';
  if (select title from public.events where id = v_biz_event) <> 'Team Night (renamed)' then
    raise exception 'FAIL: owner could not edit a member-created business event';
  end if;
  perform pg_temp.ok('owner manages events created by team members');

  -- members cannot manage the team
  perform pg_temp.impersonate(bob, 'bob@test.dev');
  begin
    insert into public.business_members (business_id, email, user_id, status)
      values (v_biz, 'dave@test.dev', dave, 'pending');
    raise exception 'FAIL: member invited another member' using errcode = 'assert_failure';
  exception when insufficient_privilege then
    perform pg_temp.ok('member cannot invite other members (owner only)');
  end;
  delete from public.business_members where business_id = v_biz and email = 'newbie@test.dev';
  update public.business_members set status = 'declined' where business_id = v_biz and email = 'newbie@test.dev';
  execute 'reset role';
  if (select status from public.business_members where business_id = v_biz and email = 'newbie@test.dev') is distinct from 'pending' then
    raise exception 'FAIL: member changed or removed another member''s row';
  end if;
  perform pg_temp.ok('member cannot remove or edit other members (owner only)');

  -- strangers see nothing
  perform pg_temp.impersonate(dave, 'dave@test.dev');
  select count(*) into v_count from public.business_members where business_id = v_biz;
  if v_count <> 0 then
    raise exception 'FAIL: stranger can see business members';
  end if;
  delete from public.business_members where id = v_member;
  execute 'reset role';
  if not exists (select 1 from public.business_members where id = v_member) then
    raise exception 'FAIL: stranger removed a business member';
  end if;
  perform pg_temp.ok('stranger cannot see or remove business members');

  -- signing up with the invited email links the pending row
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000',
          '77777777-7777-7777-7777-777777777777', 'authenticated', 'authenticated',
          'newbie@test.dev', '', now(), '{}',
          json_build_object('full_name', 'New Member')::jsonb, now(), now());
  if (select user_id from public.business_members where business_id = v_biz and email = 'newbie@test.dev')
     is distinct from '77777777-7777-7777-7777-777777777777'::uuid then
    raise exception 'FAIL: signup trigger did not link the pending business invite';
  end if;
  perform pg_temp.ok('signup trigger links pending business invites by email');

  -- owner removes a member; their access ends
  perform pg_temp.impersonate(alice, 'alice@test.dev');
  delete from public.business_members where id = v_member;
  perform pg_temp.impersonate(bob, 'bob@test.dev');
  select count(*) into v_count from public.business_accounts where id = v_biz;
  if v_count <> 0 then
    raise exception 'FAIL: removed member can still read the business account';
  end if;
  perform pg_temp.ok('owner can remove members and their access ends');

  execute 'reset role';
  raise notice '';
  raise notice 'ALL % CHECKS PASSED', currval('pg_temp.t_pass');
end $test$;
