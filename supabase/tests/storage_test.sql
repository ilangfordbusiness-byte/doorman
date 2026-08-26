-- Storage policy tests: exercises storage.objects RLS by direct row inserts
-- (what the storage API does under the hood). Run after dashboard_test.sql
-- or on any db where the migrations are applied.
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

create function pg_temp.ok(msg text) returns void
language plpgsql security definer as $$
begin
  raise notice 'PASS %: %', lpad(nextval('pg_temp.t_pass')::text, 2, '0'), msg;
end $$;

do $test$
declare
  hostess uuid := 'bbbbbbbb-1111-1111-1111-111111111111';
  rando   uuid := 'bbbbbbbb-2222-2222-2222-222222222222';
  v_event uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
         u.mail, '', now(), '{}', '{"full_name":"T"}', now(), now()
  from (values (hostess, 'hostess@store.dev'), (rando, 'rando@store.dev')) as u(id, mail);

  insert into public.events (host_id, title, date, start_time, status)
    values (hostess, 'Storage Test Event', '2026-12-01', '20:00', 'published')
    returning id into v_event;

  -- avatar: own folder ok, foreign folder denied
  perform pg_temp.impersonate(rando, 'rando@store.dev');
  insert into storage.objects (bucket_id, name, owner_id)
    values ('avatars', rando::text || '/pic.jpg', rando::text);
  perform pg_temp.ok('avatar upload to own folder allowed');

  begin
    insert into storage.objects (bucket_id, name, owner_id)
      values ('avatars', hostess::text || '/fake.jpg', rando::text);
    raise exception 'FAIL: wrote to another user avatar folder' using errcode = 'assert_failure';
  exception when insufficient_privilege then
    perform pg_temp.ok('avatar upload to another user folder denied');
  end;

  -- covers: manager ok, stranger denied
  begin
    insert into storage.objects (bucket_id, name, owner_id)
      values ('event-covers', v_event::text || '/cover.jpg', rando::text);
    raise exception 'FAIL: stranger wrote an event cover' using errcode = 'assert_failure';
  exception when insufficient_privilege then
    perform pg_temp.ok('cover upload by non-manager denied');
  end;

  perform pg_temp.impersonate(hostess, 'hostess@store.dev');
  insert into storage.objects (bucket_id, name, owner_id)
    values ('event-covers', v_event::text || '/cover.jpg', hostess::text);
  perform pg_temp.ok('cover upload by event manager allowed');

  -- public read
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  if (select count(*) from storage.objects
      where bucket_id in ('avatars', 'event-covers')
        and name like '%' || 'pic.jpg') < 1 then
    raise exception 'FAIL: anon cannot read public bucket listing';
  end if;
  perform pg_temp.ok('anon can read public bucket objects');

  execute 'reset role';
  raise notice '';
  raise notice 'ALL % CHECKS PASSED', currval('pg_temp.t_pass');
end $test$;
