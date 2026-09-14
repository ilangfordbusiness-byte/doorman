-- ===========================================================================
-- Remember which country and settlement currency a connected Stripe account
-- has. stripeConnect now creates accounts with an explicit country (a US host
-- gets a US account, not the platform's GB default) and records both fields
-- from the Stripe account object whenever it fetches one; createTicketCheckout
-- reads the country to decide how a cross-border charge settles. Written by the
-- service role only — clients may read their own, never update.
-- ===========================================================================
alter table public.profiles
  add column if not exists stripe_account_country text,
  add column if not exists stripe_default_currency text;

alter table public.business_accounts
  add column if not exists stripe_account_country text,
  add column if not exists stripe_default_currency text;

-- Every account created before this migration inherited the platform's
-- country (GB / gbp). The status refresh corrects these if Stripe disagrees.
update public.profiles
   set stripe_account_country = 'GB', stripe_default_currency = 'gbp'
 where stripe_account_id is not null and stripe_account_country is null;
update public.business_accounts
   set stripe_account_country = 'GB', stripe_default_currency = 'gbp'
 where stripe_account_id is not null and stripe_account_country is null;

-- profiles is readable by any signed-in user (profiles_select), so these join
-- the readable set like stripe_onboarding_status; business_accounts is already
-- owner-only. No update grant for either: only stripeConnect writes them.
grant select (stripe_account_country, stripe_default_currency) on public.profiles to authenticated;
