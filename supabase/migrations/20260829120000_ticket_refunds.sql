-- Guest self-service refunds.
--
-- Each paid ticket entry now records the order it came from, so the refund
-- function can find the payment, and the app can tell which tickets are
-- refundable. Orders track how much has been refunded (multi-ticket orders
-- refund per ticket; status flips to 'refunded' only when nothing sellable
-- remains).

alter table public.guestlist_entries
  add column order_id uuid references public.ticket_orders(id) on delete set null;

alter table public.ticket_orders
  add column refunded_minor bigint not null default 0;

-- Backfill the single-ticket linkage the webhook already recorded.
update public.guestlist_entries g
   set order_id = o.id
  from public.ticket_orders o
 where o.guestlist_entry_id = g.id;

-- Recreate the client view with order_id so ticket owners can see which of
-- their tickets are refundable. Same access rules as before.
create or replace view public.guestlist_entries_view
with (security_barrier) as
  select g.id, g.event_id, g.guest_user_id, g.guest_email, g.guest_name,
         g.guest_phone, g.status, g.source, g.plus_one, g.plus_one_name,
         g.can_chat, g.checked_in_at, g.checked_in_by, g.checked_out_at,
         case when public.is_event_staff(g.event_id) then g.notes end as notes,
         g.created_by, g.created_at, g.updated_at,
         g.order_id
  from public.guestlist_entries g
  where g.guest_user_id = auth.uid()
     or g.guest_email = public.current_email()
     or public.is_event_staff(g.event_id);
