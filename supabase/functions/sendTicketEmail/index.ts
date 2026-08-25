// Emails a guest their ticket (QR + pass link) for a guestlist entry. Used for
// free-ticket approvals; paid tickets are emailed from ticketWebhook.
import { getCaller, json, preflight, serviceClient } from '../_shared/db.ts';
import { sendTicketConfirmationEmail } from '../_shared/tickets.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const user = await getCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { entry_id } = await req.json();
    if (!entry_id) return json({ error: 'entry_id is required' }, 400);

    const { data: entry } = await svc.from('guestlist_entries').select('*')
      .eq('id', entry_id).maybeSingle();
    if (!entry) return json({ sent: false, error: 'Entry not found' });
    if (!entry.guest_email) return json({ sent: false, error: 'No guest email' });

    const { data: event } = await svc.from('events').select('*').eq('id', entry.event_id).single();
    if (!event) return json({ sent: false, error: 'Event not found' });

    // Tier name for the email body, when this entry came from a paid order.
    const { data: order } = await svc.from('ticket_orders')
      .select('tier_id, ticket_tiers(name)')
      .eq('guestlist_entry_id', entry_id).maybeSingle();
    // deno-lint-ignore no-explicit-any
    const tierName = (order as any)?.ticket_tiers?.name ?? null;

    const result = await sendTicketConfirmationEmail(svc, entry, event, tierName);
    return json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('sendTicketEmail error', msg);
    return json({ error: msg }, 500);
  }
});
