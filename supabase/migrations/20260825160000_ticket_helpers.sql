-- Atomic counter updates used by the ticket webhook. Each replaces a
-- read-modify-write in the original app version that could race under concurrent
-- payments. Service-role only — clients must never touch these counters.

create or replace function public.record_tier_sale(p_tier uuid, p_qty int)
returns void
language plpgsql as $$
begin
  update ticket_tiers
     set sold = sold + p_qty,
         sales_status = case when sold + p_qty >= quantity then 'sold_out' else sales_status end
   where id = p_tier and sold + p_qty <= quantity;
  if not found then
    -- Payment already succeeded; cap at capacity rather than violating the
    -- sold <= quantity constraint, and close the tier.
    update ticket_tiers set sold = quantity, sales_status = 'sold_out' where id = p_tier;
  end if;
end $$;

create or replace function public.record_promo_use(p_promo uuid, p_discount_minor bigint)
returns void
language plpgsql as $$
begin
  update promo_codes
     set used_count = used_count + 1,
         total_discount_given_minor = total_discount_given_minor + p_discount_minor,
         status = case when used_count + 1 >= max_uses then 'exhausted' else status end
   where id = p_promo and used_count < max_uses;
end $$;

create or replace function public.record_promoter_sale(
  p_promoter uuid, p_qty int, p_paid_minor bigint, p_commission_minor bigint,
  p_promoter_discount_minor bigint)
returns void
language plpgsql as $$
begin
  update promoters
     set tickets_sold = tickets_sold + p_qty,
         total_sales_minor = total_sales_minor + p_paid_minor,
         commission_owed_minor = commission_owed_minor + p_commission_minor,
         discount_used_count = discount_used_count
           + (case when p_promoter_discount_minor > 0 then 1 else 0 end),
         discount_given_minor = discount_given_minor + p_promoter_discount_minor
   where id = p_promoter;
end $$;

-- Counter mutations are for the webhook (service role) only.
revoke execute on function public.record_tier_sale(uuid, int) from public, anon, authenticated;
revoke execute on function public.record_promo_use(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.record_promoter_sale(uuid, int, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.record_tier_sale(uuid, int) to service_role;
grant execute on function public.record_promo_use(uuid, bigint) to service_role;
grant execute on function public.record_promoter_sale(uuid, int, bigint, bigint, bigint) to service_role;
