-- Weekly automated promoter payouts. Every Monday the payPromoterCommissions
-- function batches each promoter's unpaid commissions from events that have
-- already ended (refunds close at event start, so these can no longer be
-- clawed back) and transfers them to the promoter's connected Stripe account,
-- £10 minimum, platform absorbs the transfer fees.
select cron.schedule('pay-promoter-commissions', '0 10 * * 1',
  $$select public.invoke_edge_function('payPromoterCommissions', '{}'::jsonb)$$);
