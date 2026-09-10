-- ===========================================================================
-- Business payouts: personal Stripe only (remove separate business accounts).
--
-- Connecting a separate business Stripe account created a trap: a business
-- could be in 'business' payout mode without that account onboarded, which
-- silently blocked all ticket sales ("the host hasn't finished payment setup")
-- even when the owner's personal Stripe was active. We now always pay a
-- business event out to the owner's personal Stripe account.
--
-- This makes 'personal' the default and backfills any existing rows. The
-- column + check constraint are kept for compatibility; nothing writes
-- 'business' any more (the edge function forces personal, and the payout
-- resolver ignores the stored mode and always uses the owner account).
-- ===========================================================================
alter table public.business_accounts alter column stripe_mode set default 'personal';
update public.business_accounts set stripe_mode = 'personal' where stripe_mode <> 'personal';
