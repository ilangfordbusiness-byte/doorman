-- Automatic host payouts: each paid order records the Stripe connected account
-- its host share was routed to via the checkout session's destination charge.
-- Null means the order predates auto-payouts and was held on the platform
-- balance (settled manually).
alter table public.ticket_orders add column payout_destination text;
