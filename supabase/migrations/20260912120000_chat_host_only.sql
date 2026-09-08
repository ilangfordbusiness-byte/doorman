-- ===========================================================================
-- Event chat is host-only.
--
-- Guests could post once the host granted them chat access (can_chat). With a
-- few hundred people subscribed, every message fans out to every subscriber
-- and an open chat trips the project-wide Realtime message limit, which then
-- drops updates for everyone, promoter dashboards included. Chat is now a
-- one-way channel: the host and accepted co-hosts post, everyone on the
-- guestlist reads.
--
-- The can_chat column stays (the guestlist view and old rows reference it)
-- but no longer grants anything; the client no longer offers the toggle.
-- ===========================================================================
create or replace function public.can_chat_in_event(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_event_manager(eid)
$$;
