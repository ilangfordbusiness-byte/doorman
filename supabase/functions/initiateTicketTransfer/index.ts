// Start a ticket transfer to a friend: creates the pending transfer row and
// emails the recipient. The ticket itself moves in acceptTicketTransfer.
import { getCaller, json, preflight, serviceClient } from '../_shared/db.ts';
import { appOrigin, escapeHtml, sendEmail } from '../_shared/email.ts';

function buildTransferEmailHtml(senderName: string, eventTitle: string, recipientName: string) {
  const s = escapeHtml(senderName);
  const e = escapeHtml(eventTitle);
  const r = escapeHtml(recipientName);
  const link = `${appOrigin()}/guest`;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a12;font-family:Inter,Segoe UI,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#0a0a12;color:#e8e8f0;padding:32px 24px 48px;">
    <p style="margin:0 0 24px;font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#7a7a9a;text-align:center;">DoorMan · Ticket Transfer</p>
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#ffffff;text-align:center;">${s} sent you a ticket</h1>
    ${r ? `<p style="margin:0 0 24px;text-align:center;color:#b0b0c8;">Hi ${r},</p>` : ''}
    <div style="background:#15151f;border:1px solid #2a2a3a;border-radius:16px;padding:20px;text-align:center;">
      <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#ffffff;">${e}</p>
      <p style="margin:0;font-size:13px;color:#b0b0c8;line-height:1.6;">${s} wants to transfer their ticket to you. Accept it to get your own QR pass for the event.</p>
    </div>
    <div style="text-align:center;margin:24px 0 8px;">
      <a href="${link}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;">View &amp; Accept Transfer</a>
    </div>
    <p style="margin:8px 0 0;text-align:center;font-size:11px;color:#7a7a9a;line-height:1.6;">Open the DoorMan app and check your <strong>Transfers</strong> tab. If you don't have an account yet, sign up first, then accept the transfer once logged in.</p>
    <p style="margin:32px 0 0;text-align:center;font-size:10px;color:#3a3a4a;">Powered by DoorMan</p>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const user = await getCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { guestlist_entry_id, recipient_email, recipient_name } = await req.json();
    if (!guestlist_entry_id || !recipient_email) {
      return json({ error: 'Missing ticket or recipient' }, 400);
    }
    const recipient = String(recipient_email).trim().toLowerCase();
    if (recipient === String(user.email).toLowerCase()) {
      return json({ error: "You can't transfer a ticket to yourself." }, 400);
    }

    const { data: entry } = await svc.from('guestlist_entries').select('*')
      .eq('id', guestlist_entry_id).maybeSingle();
    if (!entry) return json({ error: 'Ticket not found.' }, 404);
    if (entry.guest_user_id !== user.id && entry.guest_email !== user.email) {
      return json({ error: "You don't own this ticket." }, 403);
    }
    if (entry.status === 'checked_in') {
      return json({ error: "This ticket has already been used and can't be transferred." }, 400);
    }
    if (!['approved', 'invited'].includes(entry.status)) {
      return json({ error: "This ticket can't be transferred." }, 400);
    }

    const { count: pending } = await svc.from('ticket_transfers')
      .select('id', { count: 'exact', head: true })
      .eq('guestlist_entry_id', guestlist_entry_id).eq('status', 'pending');
    if ((pending ?? 0) > 0) {
      return json({ error: 'This ticket already has a pending transfer. Cancel it first.' }, 409);
    }

    const { data: event } = await svc.from('events').select('id, title').eq('id', entry.event_id).single();
    const eventTitle = event?.title || 'your event';

    // Link the recipient's account if they already have one.
    const { data: recipientProfile } = await svc.from('profiles')
      .select('id').eq('email', recipient).maybeSingle();

    const { data: transfer, error } = await svc.from('ticket_transfers').insert({
      guestlist_entry_id,
      event_id: entry.event_id,
      sender_id: user.id,
      recipient_email: recipient,
      recipient_id: recipientProfile?.id ?? null,
    }).select('*').single();
    if (error) return json({ error: error.message }, 400);

    const senderName = user.full_name || user.email;
    const emailResult = await sendEmail({
      to: recipient,
      subject: `${user.full_name || 'Someone'} sent you a ticket for ${eventTitle}`,
      html: buildTransferEmailHtml(senderName, eventTitle, recipient_name || recipient),
    });
    if (!emailResult.sent) console.log('initiateTicketTransfer email error', emailResult.error);

    return json({ ok: true, transfer });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('initiateTicketTransfer error', msg);
    return json({ error: msg }, 500);
  }
});
