// Accept a pending ticket transfer: re-points the guestlist entry at the
// recipient and regenerates the QR secret (invalidating old screenshots).
// The TicketOrder (payment, promoter attribution) is intentionally untouched.
import { getCaller, json, preflight, randomSecret, serviceClient } from '../_shared/db.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const user = await getCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { transfer_id } = await req.json();
    if (!transfer_id) return json({ error: 'Missing transfer id' }, 400);

    const { data: transfer } = await svc.from('ticket_transfers').select('*')
      .eq('id', transfer_id).maybeSingle();
    if (!transfer) return json({ error: 'Transfer not found.' }, 404);
    if (transfer.recipient_id !== user.id && transfer.recipient_email !== user.email) {
      return json({ error: "This transfer wasn't sent to you." }, 403);
    }
    if (transfer.status !== 'pending') {
      return json({ error: 'This transfer is no longer pending.' }, 400);
    }

    const { data: entry } = await svc.from('guestlist_entries').select('*')
      .eq('id', transfer.guestlist_entry_id).maybeSingle();
    if (!entry) return json({ error: 'Ticket not found.' }, 404);
    if (entry.status === 'checked_in') {
      return json({ error: "This ticket has already been used and can't be transferred." }, 400);
    }
    if (!['approved', 'invited'].includes(entry.status)) {
      return json({ error: "This ticket can't be transferred." }, 400);
    }

    const { error: entryErr } = await svc.from('guestlist_entries').update({
      guest_user_id: user.id,
      guest_email: user.email,
      guest_name: user.full_name || user.email,
      qr_secret: randomSecret(),
    }).eq('id', entry.id);
    if (entryErr) return json({ error: entryErr.message }, 400);

    await svc.from('ticket_transfers').update({
      status: 'accepted',
      recipient_id: user.id,
      accepted_at: new Date().toISOString(),
    }).eq('id', transfer.id);

    return json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('acceptTicketTransfer error', msg);
    return json({ error: msg }, 500);
  }
});
