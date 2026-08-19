import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendTicketConfirmationEmail } from '../../shared/tickets.ts';

// Sends a guest their ticket confirmation email (QR + pass link) for a given
// guestlist entry. Used for free-ticket approvals (paid tickets are emailed
// directly from ticketWebhook on payment confirmation).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { entry_id } = await req.json();
    if (!entry_id) return Response.json({ error: 'entry_id is required' }, { status: 400 });

    const entries = await base44.asServiceRole.entities.GuestlistEntry.filter({ id: entry_id });
    const entry = entries[0];
    if (!entry) return Response.json({ sent: false, error: 'Entry not found' });
    if (!entry.guest_email) return Response.json({ sent: false, error: 'No guest email' });

    const events = await base44.asServiceRole.entities.Event.filter({ id: entry.event_id });
    const event = events[0];
    if (!event) return Response.json({ sent: false, error: 'Event not found' });

    const result = await sendTicketConfirmationEmail(base44, entry, event);
    return Response.json(result);
  } catch (error) {
    console.log('sendTicketEmail error', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});