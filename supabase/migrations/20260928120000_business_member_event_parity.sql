-- ===========================================================================
-- Business members get full host parity on their business's events, including
-- DELETING them. Every other event operation (edit, guestlist, tiers via RLS,
-- promoters, chat, door) already runs through is_event_manager(), which counts
-- business managers — the one hole was events_delete, still host-only.
-- Team management (invite/remove members) stays owner-only (unchanged).
-- ===========================================================================
drop policy if exists events_delete on public.events;
create policy events_delete on public.events
  for delete to authenticated
  using (
    host_id = auth.uid()
    or (business_id is not null and public.is_business_manager(business_id))
    or public.is_admin()
  );
