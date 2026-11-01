// Mints a short batch of rotating QR signatures for the caller's own ticket,
// for events with live_qr on. The pass fetches a batch once, renders the
// current window's code, rotates locally every LIVE_QR_PERIOD_MS, and refetches
// before the batch runs out — so it keeps working through brief signal drops at
// the door. The entry's qr_secret (the HMAC key) never leaves the server; only
// the time-bounded signatures do. validateQR recomputes and range-checks them.
import { getCaller, json, preflight, serviceClient } from '../_shared/db.ts';
import { LIVE_QR_PERIOD_MS, liveQrSig, liveQrWindow } from '../_shared/tickets.ts';

// Enough windows to cover a few minutes, with a little backfill so a scanner
// whose clock runs slightly behind still has the code it's looking for.
const BACKFILL = 3;
const COUNT = 33; // BACKFILL + ~5 min forward at a 10s period

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const user = await getCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { entry_id } = await req.json();
    if (!entry_id) return json({ error: 'Missing ticket id' }, 400);

    const { data: entry } = await svc.from('guestlist_entries')
      .select('id, event_id, guest_user_id, guest_email, qr_secret, status')
      .eq('id', entry_id).maybeSingle();
    if (!entry) return json({ error: 'Ticket not found' }, 404);
    // Only the ticket's owner can mint its codes.
    if (entry.guest_user_id !== user.id && entry.guest_email !== user.email) {
      return json({ error: "You don't own this ticket." }, 403);
    }
    if (!['approved', 'invited'].includes(entry.status)) {
      return json({ error: 'This ticket is not active.' }, 400);
    }

    const { data: event } = await svc.from('events')
      .select('id, live_qr').eq('id', entry.event_id).maybeSingle();
    if (!event?.live_qr) {
      // Not a live-QR event: the pass should use the static code instead.
      return json({ error: 'This event does not use live passes.' }, 400);
    }

    const start = liveQrWindow() - BACKFILL;
    const sigs: string[] = [];
    for (let i = 0; i < COUNT; i++) {
      sigs.push(await liveQrSig(entry.qr_secret, entry.event_id, entry.id, start + i));
    }

    return json({
      eid: entry.event_id,
      gid: entry.id,
      period_ms: LIVE_QR_PERIOD_MS,
      start_window: start,
      sigs,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('liveQrBatch error', msg);
    return json({ error: msg }, 500);
  }
});
