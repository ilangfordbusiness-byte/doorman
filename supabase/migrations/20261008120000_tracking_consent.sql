-- ===========================================================================
-- Tracking consent per order (iOS App Tracking Transparency)
--
-- In the iOS app, organiser Meta ads tracking runs only when the buyer
-- allowed tracking in the ATT prompt. createTicketCheckout records the
-- answer here; ticketWebhook skips the Conversions API Purchase for an order
-- whose row says tracking_allowed = false. Web orders and orders with no row
-- keep the old behaviour (allowed).
-- ===========================================================================

alter table public.ticket_order_tracking
  add column if not exists tracking_allowed boolean not null default true;
