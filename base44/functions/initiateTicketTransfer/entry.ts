import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function buildTransferEmailHtml(senderName, eventTitle, recipientName) {
  const s = escapeHtml(senderName);
  const e = escapeHtml(eventTitle);
  const r = escapeHtml(recipientName);
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a12;font-family:Inter,Segoe UI,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#0a0a12;color:#e8e8f0;padding:32px 24px;">
    <p style="margin:0 0 24px;font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#7a7a9a;text-align:center;">DoorMan · Ticket Transfer</p>
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#ffffff;text-align:center;">${s} sent you a ticket</h1>
    ${r ? `<p style="margin:0 0 24px;text-align:center;color:#b0b0c8;">Hi ${r},</p>` : ""}
    <div style="background:#15151f;border:1px solid #2a2a3a;border-radius:16px;padding:20px;text-align:center;">
      <p style="margin:0 0 6px;font-size:13px;color:#7a7a9a;">For</p>
      <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#ffffff;">${e}</p>
      <p style="margin:0;font-size:13px;color:#b0b0c8;line-height:1.6;">${s} wants to transfer their ticket to you. Accept it to get your own QR pass for the event.</p>
    </div>
    <div style="text-align:center;margin:24px 0 8px;">
      <a href="https://thedoorman.app/guest" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;">View &amp; Accept Transfer</a>
    </div>
    <p style="margin:8px 0 0;text-align:center;font-size:11px;color:#7a7a9a;line-height:1.6;">Open the DoorMan app and check your <strong>Transfers</strong> tab. If you don't have an account yet, sign up first, then accept the transfer once logged in.</p>
    <p style="margin:24px 0 0;text-align:center;font-size:10px;color:#3a3a4a;">Powered by DoorMan</p>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { guestlist_entry_id, recipient_email, recipient_name } = await req.json();
    if (!guestlist_entry_id || !recipient_email) {
      return Response.json({ error: 'Missing ticket or recipient' }, { status: 400 });
    }
    const recipient = String(recipient_email).trim().toLowerCase();
    if (recipient === String(user.email).toLowerCase()) {
      return Response.json({ error: "You can't transfer a ticket to yourself." }, { status: 400 });
    }

    const entries = await base44.asServiceRole.entities.GuestlistEntry.filter({ id: guestlist_entry_id });
    const entry = entries[0];
    if (!entry) return Response.json({ error: 'Ticket not found.' }, { status: 404 });
    if (entry.guest_email !== user.email) {
      return Response.json({ error: "You don't own this ticket." }, { status: 403 });
    }
    if (entry.status === 'checked_in') {
      return Response.json({ error: "This ticket has already been used and can't be transferred." }, { status: 400 });
    }
    if (!['approved', 'invited'].includes(entry.status)) {
      return Response.json({ error: "This ticket can't be transferred." }, { status: 400 });
    }

    // Block re-transfer while a transfer is already pending for this ticket.
    const existing = await base44.asServiceRole.entities.TicketTransfer.filter({
      guestlist_entry_id,
      status: 'pending',
    });
    if (existing.length) {
      return Response.json({ error: 'This ticket already has a pending transfer. Cancel it first.' }, { status: 409 });
    }

    const events = await base44.asServiceRole.entities.Event.filter({ id: entry.event_id });
    const event = events[0];
    const eventTitle = event?.title || 'your event';

    const transfer = await base44.asServiceRole.entities.TicketTransfer.create({
      guestlist_entry_id,
      event_id: entry.event_id,
      event_title: eventTitle,
      sender_email: user.email,
      sender_name: user.full_name || user.email,
      recipient_email: recipient,
      recipient_name: recipient_name || recipient,
      status: 'pending',
    });

    try {
      const html = buildTransferEmailHtml(user.full_name || user.email, eventTitle, recipient_name || recipient);
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: recipient,
        subject: `${user.full_name || 'Someone'} sent you a ticket for ${eventTitle}`,
        body: html,
      });
    } catch (e) {
      console.log('initiateTicketTransfer email error', e?.message || String(e));
    }

    return Response.json({ ok: true, transfer });
  } catch (error) {
    console.log('initiateTicketTransfer error', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});