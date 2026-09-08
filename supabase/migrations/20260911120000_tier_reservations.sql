-- ===========================================================================
-- Seat reservations at checkout.
--
-- Before this, createTicketCheckout only refused a buyer once `sold` reached
-- `quantity`, and `sold` moves when the Stripe webhook fulfils the order. So
-- everyone who opened checkout while seats still looked free got a session,
-- and everyone who then paid got a ticket: a 20-seat tier issued 22 tickets
-- in the 2026-09-08 load test, and record_tier_sale's cap hid it (sold=20).
--
-- Now a checkout reserves its seats up front, atomically, under a constraint
-- the database enforces (sold + reserved <= quantity). The reservation turns
-- into a sale when the webhook fulfils the order, and is released when the
-- buyer cancels, the Stripe session expires, or the sweep below finds a
-- pending order past its deadline.
-- ===========================================================================

alter table public.ticket_tiers
  add column if not exists reserved integer not null default 0 check (reserved >= 0);
alter table public.ticket_tiers
  add constraint ticket_tiers_capacity check (sold + reserved <= quantity);

-- Reservation deadline for a pending order (mirrors the Stripe session expiry).
alter table public.ticket_orders
  add column if not exists expires_at timestamptz;
create index if not exists ticket_orders_pending_expiry_idx
  on public.ticket_orders (expires_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- reserve_tier_seats: the one check-then-write that must not race. Returns
-- true and holds the seats, or false (tier closed / not enough seats left).
-- ---------------------------------------------------------------------------
create or replace function public.reserve_tier_seats(p_tier uuid, p_qty int)
returns boolean
language plpgsql as $$
begin
  if p_qty is null or p_qty < 1 then
    return false;
  end if;
  update ticket_tiers
     set reserved = reserved + p_qty
   where id = p_tier
     and sales_status = 'open'
     and sold + reserved + p_qty <= quantity;
  return found;
end $$;

create or replace function public.release_tier_seats(p_tier uuid, p_qty int)
returns void
language plpgsql as $$
begin
  update ticket_tiers
     set reserved = greatest(0, reserved - greatest(0, coalesce(p_qty, 0)))
   where id = p_tier;
end $$;

-- A sale converts a reservation. Same capacity fallback as before for orders
-- that pre-date reservations (webhook for an order created before this
-- migration): never violate the constraint, close the tier instead.
create or replace function public.record_tier_sale(p_tier uuid, p_qty int)
returns void
language plpgsql as $$
begin
  update ticket_tiers
     set sold = sold + p_qty,
         reserved = greatest(0, reserved - p_qty),
         sales_status = case when sold + p_qty >= quantity then 'sold_out' else sales_status end
   where id = p_tier and sold + p_qty <= quantity;
  if not found then
    update ticket_tiers set sold = quantity, reserved = 0, sales_status = 'sold_out'
     where id = p_tier;
  end if;
end $$;

-- Cancels one pending order and frees its seats. Idempotent: only the call
-- that flips pending -> cancelled releases anything. Used by the cancel path,
-- the checkout.session.expired webhook, and the sweep.
create or replace function public.cancel_pending_ticket_order(p_order uuid)
returns boolean
language plpgsql as $$
declare
  v_tier uuid;
  v_qty int;
begin
  update ticket_orders
     set status = 'cancelled'
   where id = p_order and status = 'pending'
  returning tier_id, quantity into v_tier, v_qty;
  if not found then
    return false;
  end if;
  perform public.release_tier_seats(v_tier, v_qty);
  return true;
end $$;

-- Safety net: any pending order still open two minutes after its deadline
-- (Stripe will not complete an expired session) is cancelled and its seats
-- freed. Orders from before reservations existed have no deadline and are
-- left alone.
create or replace function public.expire_stale_ticket_orders()
returns int
language plpgsql as $$
declare
  v_id uuid;
  v_n int := 0;
begin
  for v_id in
    select id from ticket_orders
     where status = 'pending'
       and expires_at is not null
       and expires_at < now() - interval '2 minutes'
  loop
    if public.cancel_pending_ticket_order(v_id) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

revoke execute on function public.reserve_tier_seats(uuid, int) from public, anon, authenticated;
revoke execute on function public.release_tier_seats(uuid, int) from public, anon, authenticated;
revoke execute on function public.cancel_pending_ticket_order(uuid) from public, anon, authenticated;
revoke execute on function public.expire_stale_ticket_orders() from public, anon, authenticated;
grant execute on function public.reserve_tier_seats(uuid, int) to service_role;
grant execute on function public.release_tier_seats(uuid, int) to service_role;
grant execute on function public.cancel_pending_ticket_order(uuid) to service_role;
grant execute on function public.expire_stale_ticket_orders() to service_role;

do $$
begin
  perform cron.unschedule('expire-ticket-orders');
exception when others then null;
end $$;
select cron.schedule('expire-ticket-orders', '*/5 * * * *',
  $$select public.expire_stale_ticket_orders()$$);
