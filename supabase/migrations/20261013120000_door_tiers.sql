-- ===========================================================================
-- "Door" ticket tiers.
--
-- A door tier is a normal paid tier that is HIDDEN from the public event page
-- and normal checkout, and sellable only through a QR shown in the scanner.
-- Hosts use it to sell to walk-ups at the door without touching how tickets
-- sell online: door tiers carry their own quantity/sold and never appear in the
-- public ticket picker.
--
-- The gate is enforced in the database (not the client):
--   * door tiers are excluded from the world-readable tier policies — only the
--     event's managers see their own (so the host editor works), and buyers
--     reach them only through get_door_tiers() with the event's secret token;
--   * createTicketCheckout (service role) additionally requires a matching
--     door_sale_token before a door tier can be purchased.
-- door_sale_token is a secret column on events, protected the same way as
-- staff_code / invite_code: events had `revoke select` + explicit per-column
-- grants, so a new, ungranted column is simply never client-readable. It is
-- handed to authorized door operators via get_door_sale_token().
-- ===========================================================================

-- 1. Tier flag -------------------------------------------------------------
alter table public.ticket_tiers
  add column if not exists door_only boolean not null default false;

-- 2. Per-event secret token (ungranted => not client-readable) -------------
alter table public.events
  add column if not exists door_sale_token text;
update public.events
  set door_sale_token = encode(extensions.gen_random_bytes(16), 'hex')
  where door_sale_token is null;
alter table public.events
  alter column door_sale_token set default encode(extensions.gen_random_bytes(16), 'hex'),
  alter column door_sale_token set not null;

-- 3. Hide door tiers from the normal (world-readable) tier policies ---------
-- Authenticated: everyone but a manager of the event stops seeing door tiers.
-- Managers keep full visibility of their own event's tiers (host editor reads
-- tiers straight from the table via PostgREST).
drop policy if exists tiers_select_auth on public.ticket_tiers;
create policy tiers_select_auth on public.ticket_tiers
  for select to authenticated
  using (door_only = false or public.is_event_manager(event_id));

-- Anon: published-event tiers, minus door tiers.
drop policy if exists tiers_select_anon on public.ticket_tiers;
create policy tiers_select_anon on public.ticket_tiers
  for select to anon
  using (
    door_only = false
    and exists (select 1 from public.events e
                where e.id = event_id and e.status = 'published')
  );

-- 4. Buyer-facing reveal: door tiers for a valid token ---------------------
-- A walk-up on the scanner's door link cannot read door tiers via PostgREST
-- (policies above), so the checkout fetches them here. Returns rows only when
-- the token matches the event's secret and the event is published.
create or replace function public.get_door_tiers(p_event_id uuid, p_token text)
returns setof public.ticket_tiers
language sql stable security definer set search_path = public as $$
  select t.*
  from public.ticket_tiers t
  join public.events e on e.id = t.event_id
  where t.event_id = p_event_id
    and t.door_only
    and e.status = 'published'
    and p_token is not null
    and e.door_sale_token = p_token
  order by t.sort_order;
$$;
revoke execute on function public.get_door_tiers(uuid, text) from public, anon;
grant execute on function public.get_door_tiers(uuid, text) to authenticated;

-- 5. Operator-facing reveal: the event's door token ------------------------
-- Authorized door operators (host / co-host / event_staff / business owner or
-- accepted member — exactly what is_event_staff covers) fetch the token to
-- build the scanner's door-sale QR. Returns null when the event has no door
-- tier, so the scanner falls back to its ordinary "buy tickets" QR.
create or replace function public.get_door_sale_token(p_event_id uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare v_token text;
begin
  if not public.is_event_staff(p_event_id) then
    raise exception 'Not authorized';
  end if;
  select case
           when exists (select 1 from public.ticket_tiers t
                        where t.event_id = p_event_id and t.door_only)
           then e.door_sale_token
           else null
         end
    into v_token
  from public.events e
  where e.id = p_event_id;
  return v_token;
end $$;
revoke execute on function public.get_door_sale_token(uuid) from public, anon;
grant execute on function public.get_door_sale_token(uuid) to authenticated;
