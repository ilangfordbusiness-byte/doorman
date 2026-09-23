-- ===========================================================================
-- Optional per-tier description.
--
-- Hosts can add a short blurb to each ticket tier ("Includes a welcome
-- drink", "Entry before 11pm only", ...). It shows under the tier name on the
-- guest event page and at checkout. Nullable, so existing tiers are unchanged;
-- the length cap is enforced here so no tier can carry an essay regardless of
-- which tier of the app writes it. Writes still go through manageTicketCatalog.
-- ===========================================================================
alter table public.ticket_tiers
  add column if not exists description text
    check (description is null or char_length(description) <= 280);
