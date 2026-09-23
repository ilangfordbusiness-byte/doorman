-- ===========================================================================
-- Organiser ad tracking: Meta Pixel + Conversions API per business account.
--
-- A business that runs Meta (Facebook/Instagram) ads for its events can paste
-- in its own Pixel ID and a Conversions API access token. DoorMan then:
--   * loads the business's pixel on its event + checkout pages (browser side,
--     pixel id via the anon-readable business_public view), and
--   * posts a server-side Purchase event from ticketWebhook using the token,
--     so ticket sales are attributed to the business's ads even when the
--     browser pixel is blocked.
--
-- The access token is a secret: managers may write it but never read it back
-- (column grant), the same pattern as events.host_notes. meta_capi_token_set
-- is a generated flag so the UI can show "token saved" without the value.
--
-- ticket_order_tracking stores the browser identifiers (_fbp/_fbc cookies),
-- client IP and user agent captured at checkout so the server-side event can
-- be matched to the ad click. Service-role only; never granted to clients.
-- ===========================================================================

alter table public.business_accounts
  add column if not exists meta_pixel_id text
    check (meta_pixel_id is null or meta_pixel_id ~ '^[0-9]{5,20}$'),
  add column if not exists meta_capi_token text,
  add column if not exists meta_test_event_code text,
  add column if not exists meta_capi_token_set boolean
    generated always as (coalesce(meta_capi_token, '') <> '') stored;

-- Narrow the client-readable columns: everything a manager could read before,
-- minus the token. (Table-level select was the baseline grant; column grants
-- mean select('*') now fails on this table — the data layer lists columns.)
revoke select on public.business_accounts from authenticated, anon;
grant select (id, owner_id, business_email, business_name, business_picture_url,
              stripe_mode, stripe_account_id, stripe_onboarding_status,
              stripe_account_country, stripe_default_currency, description,
              instagram, meta_pixel_id, meta_test_event_code,
              meta_capi_token_set, created_at, updated_at)
  on public.business_accounts to authenticated;
grant update (meta_pixel_id, meta_capi_token, meta_test_event_code)
  on public.business_accounts to authenticated;

-- Pixel IDs are public by nature (they ship in every page that uses them), so
-- guests and anon read them through the public view alongside the host name.
create or replace view public.business_public as
  select id, business_name, business_picture_url, description, instagram, meta_pixel_id
  from public.business_accounts;
grant select on public.business_public to authenticated, anon;

-- Browser match keys captured at checkout (only when the event's business has
-- a pixel configured). Read/written exclusively by edge functions.
create table if not exists public.ticket_order_tracking (
  order_id uuid primary key references public.ticket_orders(id) on delete cascade,
  fbp text,
  fbc text,
  client_ip text,
  client_user_agent text,
  event_source_url text,
  created_at timestamptz not null default now()
);
alter table public.ticket_order_tracking enable row level security;
-- Some Supabase images carry default privileges that grant new tables to
-- anon/authenticated; revoke explicitly so clients get a permission error,
-- not an empty (RLS-filtered) result, and rls_test behaves the same everywhere.
revoke all on public.ticket_order_tracking from anon, authenticated;
grant all on public.ticket_order_tracking to service_role;
