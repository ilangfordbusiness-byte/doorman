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

    // One entry (free-ticket approval / re-send) or a whole order's entries
    // (multi-ticket re-send: one email, one QR block per ticket).
    const { entry_id, entry_ids } = await req.json();
    const ids: string[] = Array.isArray(entry_ids) && entry_ids.length
      ? entry_ids
      : entry_id ? [entry_id] : [];
    if (!ids.length) return json({ error: 'entry_id is required' }, 400);

    const { data: entries } = await svc.from('guestlist_entries').select('*')
      .in('id', ids).order('guest_name');
    if (!entries?.length) return json({ sent: false, error: 'Entry not found' });
    if (new Set(entries.map((e) => e.event_id)).size > 1) {
      return json({ error: 'Entries must belong to one event' }, 400);
    }
    if (!entries[0].guest_email) return json({ sent: false, error: 'No guest email' });

    const { data: event } = await svc.from('events').select('*')
      .eq('id', entries[0].event_id).single();
    if (!event) return json({ sent: false, error: 'Event not found' });

    // Tier name for the email body, when this entry came from a paid order.
    const { data: order } = await svc.from('ticket_orders')
      .select('tier_id, ticket_tiers(name)')
      .eq('guestlist_entry_id', ids[0]).maybeSingle();
    // deno-lint-ignore no-explicit-any
    const tierName = (order as any)?.ticket_tiers?.name ?? null;

    const result = await sendTicketConfirmationEmail(
      svc, entries.length === 1 ? entries[0] : entries, event, tierName);
    return json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('sendTicketEmail error', msg);
    return json({ error: msg }, 500);
  }
});
