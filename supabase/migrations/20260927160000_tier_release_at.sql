-- ===========================================================================
-- Scheduled tier releases.
--
-- A host can set `release_at` on a ticket tier so it goes on sale at a
-- specific moment (e.g. "Second release" opening at 18:00 on Friday). Until
-- then the tier is visible to guests as "On sale from ...", cannot be selected
-- at checkout, and cannot be reserved. Once the clock passes `release_at` the
-- tier is simply on sale: no cron job, no status flip, nothing to get stuck.
-- NULL (the default, and every existing tier) means "on sale as soon as it is
-- created", which is exactly today's behaviour.
--
-- The buy path is gated in the database (reserve_tier_seats) so a client that
-- guesses a scheduled tier's id still cannot hold a seat before release.
-- ===========================================================================

alter table public.ticket_tiers
  add column if not exists release_at timestamptz;

-- reserve_tier_seats (latest = 20260911120000): a tier that has not been
-- released yet behaves like a closed one for the purpose of holding seats.
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
     and (release_at is null or release_at <= now())
     and sold + reserved + p_qty <= quantity;
  return found;
end $$;
