-- ===========================================================================
-- Fix: a new user cannot create their first business account
--
-- Since 20260918120000, business_select only allows rows where
-- is_business_manager(id) is true. The client creates a business with
-- INSERT ... RETURNING (it needs the new id). For a user who owns no business
-- yet, the INSERT passes but the RETURNING check fails: is_business_manager()
-- reads business_accounts itself and does not see the row this statement just
-- inserted. The user gets "new row violates row-level security policy for
-- table business_accounts".
--
-- Compare owner_id with auth.uid() on the row itself. Keep the manager check
-- for accepted team members.
-- ===========================================================================

drop policy if exists business_select on public.business_accounts;
create policy business_select on public.business_accounts
  for select to authenticated
  using (owner_id = auth.uid() or public.is_business_manager(id) or public.is_admin());
