-- Per-event choice of who pays the platform fee (45p + 3.5% per ticket).
--   absorb : fee comes out of the host's payout; buyers pay face value.
--   pass_on: fee is added to the buyer's price, shown all-in everywhere
--            (UK drip-pricing rules require the headline price to include it).
-- Existing events keep today's behavior (absorb); the create-event UI
-- defaults new paid events to pass_on.
alter table public.events add column fee_mode text not null default 'absorb'
  check (fee_mode in ('absorb', 'pass_on'));

-- events uses explicit column-list grants (rls_policies migration); the new
-- column is buyer-facing pricing config, so it joins the readable set and is
-- host-writable like currency/is_paid.
grant select (fee_mode) on public.events to authenticated, anon;
grant insert (fee_mode) on public.events to authenticated;
grant update (fee_mode) on public.events to authenticated;
