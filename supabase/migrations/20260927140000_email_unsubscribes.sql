-- ===========================================================================
-- Email opt-out list: one row per address that clicked "Unsubscribe" in a
-- DoorMan email (or whose mail client sent the RFC 8058 one-click POST).
--
-- Keyed by email, not user id, because notification emails also go to
-- guestlist entries that have no account yet, and the address is what the
-- link in the email identifies. citext makes the key case-insensitive.
--
-- Only the service role touches this table: _shared/email.ts consults it
-- before every bulk (notification) send, and the unsubscribeEmail edge
-- function inserts/deletes after verifying the HMAC token carried in the
-- link. Clients get no grant at all, so the list is never readable from the
-- app and a user cannot opt anyone else out. Rows outlive account deletion
-- on purpose: an address that opted out stays opted out.
-- ===========================================================================
create table if not exists public.email_unsubscribes (
  email       citext primary key,
  source      text not null default 'page' check (source in ('page', 'one-click')),
  created_at  timestamptz not null default now()
);

alter table public.email_unsubscribes enable row level security;
-- Some Supabase images carry default privileges that grant new tables to
-- anon/authenticated; revoke explicitly. Service role only.
revoke all on public.email_unsubscribes from anon, authenticated;
grant all on public.email_unsubscribes to service_role;
