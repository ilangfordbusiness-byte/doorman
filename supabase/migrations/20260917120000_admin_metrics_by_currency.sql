-- ===========================================================================
-- Admin metrics: money per currency. gmv/fees/refunded were single sums over
-- every ticket_orders row regardless of currency, which the admin page then
-- labelled with a pound sign. Add a by_currency array (one row per currency
-- with the same three figures + order counts); the flat totals stay for any
-- caller that still reads them but are no longer shown as money.
-- (latest definition = 20260826120000_admin.sql)
-- ===========================================================================
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
    'refunded_minor',   (select coalesce(sum(paid_minor), 0) from public.ticket_orders where status = 'refunded'),
    'by_currency', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'currency',        c.currency,
               'paid_orders',     c.paid_orders,
               'gmv_minor',       c.gmv_minor,
               'fees_minor',      c.fees_minor,
               'refunded_orders', c.refunded_orders,
               'refunded_minor',  c.refunded_minor) order by c.currency), '[]'::jsonb)
      from (
        select lower(o.currency) as currency,
               count(*) filter (where o.status = 'paid')                             as paid_orders,
               coalesce(sum(o.paid_minor) filter (where o.status = 'paid'), 0)         as gmv_minor,
               coalesce(sum(o.platform_fee_minor) filter (where o.status = 'paid'), 0) as fees_minor,
               count(*) filter (where o.status = 'refunded')                         as refunded_orders,
               coalesce(sum(o.paid_minor) filter (where o.status = 'refunded'), 0)     as refunded_minor
        from public.ticket_orders o
        where o.status in ('paid', 'refunded')
        group by lower(o.currency)
      ) c
    )
  ) into result;
  return result;
end $$;
