-- Live (rotating) guest passes, opt-in per event.
--
-- When live_qr is on, the guest pass shows a QR that rotates every few seconds
-- instead of the static single-use code. The rotating codes are HMAC signatures
-- keyed by the entry's qr_secret (which still never leaves the server): the
-- liveQrBatch edge function mints a short batch of them, the pass renders the
-- current window's code, and validateQR recomputes + range-checks it at the
-- door. A screenshot of one frame is only valid for a ~1 minute window, so it
-- can't be shared ahead of time. qr_secret stays unreadable by clients — this
-- migration adds no new readable secret, only a boolean flag.

alter table public.events
  add column if not exists live_qr boolean not null default false;

-- Same client column-grant pattern as the other event flags: readable by
-- everyone who can read the event (so the pass and scanner know the mode),
-- writable only by managers (RLS still gates which rows).
grant select (live_qr) on public.events to authenticated, anon;
grant update (live_qr) on public.events to authenticated;
grant insert (live_qr) on public.events to authenticated;
