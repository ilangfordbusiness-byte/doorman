-- ===========================================================================
-- Per-tier "hide remaining count" option.
--
-- Hosts can choose not to reveal how many tickets are left for a given tier.
-- The guest event page and checkout hide the "{N} left" number when this is
-- set; a sold-out tier still shows "Sold out" (availability is never hidden,
-- only the number). Defaults to false, so existing tiers keep showing counts.
-- ===========================================================================
alter table public.ticket_tiers
  add column if not exists hide_remaining boolean not null default false;
