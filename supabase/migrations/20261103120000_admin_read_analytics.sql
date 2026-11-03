-- ===========================================================================
-- Admins can read event analytics data for events they don't manage.
--
-- The analytics page (src/pages/EventAnalytics.jsx) reads ticket orders, the
-- guestlist, promoters and promo codes. Those SELECT policies were
-- manager-scoped, so a super-admin couldn't open another host's analytics.
-- Widen each SELECT (read-only) to also allow public.is_admin(). Inserts,
-- updates and deletes stay manager-only — only visibility changes — and
-- ticket_tiers is already world-readable, so it needs no change.
-- ===========================================================================

-- ticket_orders: owner / purchaser / event manager — plus admins.
drop policy if exists orders_select on public.ticket_orders;
create policy orders_select on public.ticket_orders
  for select to authenticated
  using (guest_user_id = auth.uid()
         or guest_email = public.current_email()
         or public.is_event_manager(event_id)
         or public.is_admin());

-- guestlist_entries: own row / event staff — plus admins.
drop policy if exists guestlist_select on public.guestlist_entries;
create policy guestlist_select on public.guestlist_entries
  for select to authenticated
  using (guest_user_id = auth.uid()
         or guest_email = public.current_email()
         or public.is_event_staff(event_id)
         or public.is_admin());

-- promoters: event manager / the promoter themselves — plus admins.
drop policy if exists promoters_select on public.promoters;
create policy promoters_select on public.promoters
  for select to authenticated
  using (public.is_event_manager(event_id)
         or user_id = auth.uid() or email = public.current_email()
         or public.is_admin());

-- promo_codes: event manager only — plus admins.
drop policy if exists promo_select on public.promo_codes;
create policy promo_select on public.promo_codes
  for select to authenticated
  using (public.is_event_manager(event_id) or public.is_admin());
