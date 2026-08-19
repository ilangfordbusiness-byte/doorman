import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { transfer_id } = await req.json();
    if (!transfer_id) return Response.json({ error: 'Missing transfer id' }, { status: 400 });

    const transfers = await base44.asServiceRole.entities.TicketTransfer.filter({ id: transfer_id });
    const transfer = transfers[0];
    if (!transfer) return Response.json({ error: 'Transfer not found.' }, { status: 404 });
    if (transfer.recipient_email !== user.email) {
      return Response.json({ error: "This transfer wasn't sent to you." }, { status: 403 });
    }
    if (transfer.status !== 'pending') {
      return Response.json({ error: 'This transfer is no longer pending.' }, { status: 400 });
    }

    const entries = await base44.asServiceRole.entities.GuestlistEntry.filter({ id: transfer.guestlist_entry_id });
    const entry = entries[0];
    if (!entry) return Response.json({ error: 'Ticket not found.' }, { status: 404 });
    // Block transfer of a ticket that has already been scanned at the door.
    if (entry.status === 'checked_in') {
      return Response.json({ error: "This ticket has already been used and can't be transferred." }, { status: 400 });
    }
    if (!['approved', 'invited'].includes(entry.status)) {
      return Response.json({ error: "This ticket can't be transferred." }, { status: 400 });
    }

    // Regenerate the QR secret (invalidates the old QR, even screenshots) and
    // reassign ownership to the recipient. The TicketOrder (payment, promoter
    // attribution, original payer for refunds) is intentionally left untouched.
    const new_secret = Math.random().toString(36).substring(2, 18);
    await base44.asServiceRole.entities.GuestlistEntry.update(entry.id, {
      guest_email: transfer.recipient_email,
      guest_name: transfer.recipient_name || transfer.recipient_email,
      qr_secret: new_secret,
    });

    await base44.asServiceRole.entities.TicketTransfer.update(transfer.id, {
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.log('acceptTicketTransfer error', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});