-- Capacity-safe seat accounting for the ticket webhook.
--
-- Overselling was possible because checkout only checked `sold < quantity`
-- without a reservation: many concurrent buyers for the last seats all pass the
-- check, all pay, and the webhook issued a ticket to each. These functions make
-- the seat the atomic unit: grant_tier_seats claims p_qty seats within capacity
-- and reports whether it succeeded; if the tier filled first it returns false
-- and the webhook refunds that buyer instead of overselling. release_tier_seats
-- gives seats back if ticket issuance fails after a grant, so a Stripe retry
-- doesn't double-count. Service-role only (the webhook), like the other
-- counters in ticket_helpers.

create or replace function public.grant_tier_seats(p_tier uuid, p_qty int)
returns boolean
language plpgsql as $$
declare v_granted boolean;
begin
  update ticket_tiers
     set sold = sold + p_qty,
         sales_status = case when sold + p_qty >= quantity then 'sold_out' else sales_status end
   where id = p_tier and sold + p_qty <= quantity;
  v_granted := found;
  if not v_granted then
    -- No seats left: make sure the tier reads sold out.
    update ticket_tiers set sales_status = 'sold_out' where id = p_tier;
  end if;
  return v_granted;
end $$;

create or replace function public.release_tier_seats(p_tier uuid, p_qty int)
returns void
language plpgsql as $$
begin
  update ticket_tiers
     set sold = greatest(0, sold - p_qty),
         sales_status = case
           when sales_status = 'sold_out' and greatest(0, sold - p_qty) < quantity then 'open'
           else sales_status end
   where id = p_tier;
end $$;

revoke execute on function public.grant_tier_seats(uuid, int) from public, anon, authenticated;
revoke execute on function public.release_tier_seats(uuid, int) from public, anon, authenticated;
grant execute on function public.grant_tier_seats(uuid, int) to service_role;
grant execute on function public.release_tier_seats(uuid, int) to service_role;
