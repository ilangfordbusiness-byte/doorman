-- A promoter's commission can never reduce what they are owed. createTicketCheckout
-- now clamps commission to 0 or above, but an order created before that deploy can
-- still be pending with a negative commission_minor when its payment completes, and
-- ticketWebhook passes that value straight here. Same signature, so the service-role
-- only grants from 20260825160000_ticket_helpers.sql stay in place.
--
-- No check constraint on ticket_orders.commission_minor yet: a NOT VALID check
-- would still reject any later update to an existing negative row, including
-- ticketWebhook claiming a pending order, which would strand a paid order.
create or replace function public.record_promoter_sale(
  p_promoter uuid, p_qty int, p_paid_minor bigint, p_commission_minor bigint,
  p_promoter_discount_minor bigint)
returns void
language plpgsql as $$
begin
  update promoters
     set tickets_sold = tickets_sold + p_qty,
         total_sales_minor = total_sales_minor + p_paid_minor,
         commission_owed_minor = commission_owed_minor + greatest(p_commission_minor, 0),
         discount_used_count = discount_used_count
           + (case when p_promoter_discount_minor > 0 then 1 else 0 end),
         discount_given_minor = discount_given_minor + p_promoter_discount_minor
   where id = p_promoter;
end $$;
