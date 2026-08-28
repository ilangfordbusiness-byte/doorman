-- ===========================================================================
-- Admin account & admin panel support.
--
-- Adds a real, secure admin capability on top of the existing role column:
--   * a single bootstrap admin (ilangfordbusiness@gmail.com), granted only
--     server-side — clients still cannot update `role` or `banned_at`, so the
--     dead in-app PIN unlock stays inert;
--   * a `banned_at` flag on profiles (display-only for clients);
--   * an append-only `admin_audit_log`, readable only by admins;
--   * an `admin_dashboard_metrics()` aggregate read for the admin dashboard.
--
-- All admin *mutations* run through service-role edge functions gated by
-- requireAdmin() — there are deliberately no new client write grants here.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Bootstrap admin. The signup trigger promotes the one designated email on
--    account creation; the backfill covers the account if it already exists.
--    email is citext, so the comparison is case-insensitive.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
security definer set search_path = public
language plpgsql as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'avatar_url',
    case when new.email = 'ilangfordbusiness@gmail.com' then 'admin' else 'user' end
  );

  update public.guestlist_entries set guest_user_id = new.id
    where guest_user_id is null and guest_email = new.email;
  update public.event_co_hosts set user_id = new.id
    where user_id is null and email = new.email;
  update public.event_staff set user_id = new.id
    where user_id is null and email = new.email;
  update public.promoters set user_id = new.id
    where user_id is null and email = new.email;
  update public.ticket_orders set guest_user_id = new.id
    where guest_user_id is null and guest_email = new.email;
  update public.ticket_transfers set recipient_id = new.id
    where recipient_id is null and recipient_email = new.email;

  return new;
end $$;

update public.profiles set role = 'admin'
  where email = 'ilangfordbusiness@gmail.com' and role <> 'admin';

-- ---------------------------------------------------------------------------
-- 2. banned_at — set only by the adminUsers edge function (service role).
--    Readable by clients (for the admin UI); never in the client update grant.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists banned_at timestamptz;
grant select (banned_at) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 3. admin_audit_log — append-only record of every admin mutation. Written by
--    service-role edge functions; readable only by admins; clients never write.
-- ---------------------------------------------------------------------------
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete set null,
  admin_email citext,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;

-- Explicit grants (new tables get none by default): service_role writes,
-- authenticated may only SELECT — and RLS narrows that to admins.
grant all on public.admin_audit_log to service_role;
grant select on public.admin_audit_log to authenticated;

create policy admin_audit_select on public.admin_audit_log
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Dashboard metrics — a hot aggregation read (many tables, one round trip).
--    security definer so it can count across tables; gated by is_admin() so a
--    non-admin calling it directly gets nothing.
-- ---------------------------------------------------------------------------
create or replace function public.admin_dashboard_metrics()
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare result jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'users',            (select count(*) from public.profiles),
    'admins',           (select count(*) from public.profiles where role = 'admin'),
    'banned',           (select count(*) from public.profiles where banned_at is not null),
    'events',           (select count(*) from public.events),
    'published_events', (select count(*) from public.events where status = 'published'),
    'paid_orders',      (select count(*) from public.ticket_orders where status = 'paid'),
    'gmv_minor',        (select coalesce(sum(paid_minor), 0) from public.ticket_orders where status = 'paid'),
    'fees_minor',       (select coalesce(sum(platform_fee_minor), 0) from public.ticket_orders where status = 'paid'),
    'refunded_orders',  (select count(*) from public.ticket_orders where status = 'refunded'),
    'refunded_minor',   (select coalesce(sum(paid_minor), 0) from public.ticket_orders where status = 'refunded')
  ) into result;
  return result;
end $$;

grant execute on function public.admin_dashboard_metrics() to authenticated;
