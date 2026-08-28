// Host-only CRUD for ticket tiers and promo codes. Prices arrive in major
// units from the UI and are stored as minor units.
import { getCaller, json, preflight, serviceClient } from '../_shared/db.ts';
import { PAYOUT_SETUP_ERROR, resolvePayoutAccount } from '../_shared/connect.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const user = await getCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const { action } = body;

    let eventId: string | undefined = body.event_id;
    if ((action === 'delete_tier' || action === 'delete_promo') && !eventId && body.id) {
      const table = action === 'delete_tier' ? 'ticket_tiers' : 'promo_codes';
      const { data: rec } = await svc.from(table).select('event_id').eq('id', body.id).single();
      eventId = rec?.event_id;
    }
    if (!eventId) return json({ error: 'Missing event_id' }, 400);

    const { data: evt } = await svc.from('events').select('id, host_id, business_id')
      .eq('id', eventId).single();
    if (!evt) return json({ error: 'Event not found' }, 404);
    if (evt.host_id !== user.id) {
      return json({ error: 'Only the event host can manage the ticket catalog' }, 403);
    }

    if (action === 'create_tier') {
      const { name, price, quantity } = body;
      if (!name || price == null || quantity == null) {
        return json({ error: 'Missing tier fields' }, 400);
      }
      // Selling tickets requires payout-ready Stripe onboarding — the host's
      // share is auto-routed at purchase, so there is no platform-held path.
      const payout = await resolvePayoutAccount(svc, evt);
      if (!payout.active) return json({ error: PAYOUT_SETUP_ERROR }, 400);
      const { data: tier, error } = await svc.from('ticket_tiers').insert({
        event_id: eventId,
        name,
        price_minor: Math.round(Number(price) * 100),
        quantity: Math.round(Number(quantity)),
        sort_order: body.sort_order ?? 0,
      }).select('*').single();
      if (error) return json({ error: error.message }, 400);
      return json({ tier });
    }

    if (action === 'delete_tier') {
      const { error } = await svc.from('ticket_tiers').delete().eq('id', body.id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === 'create_promo') {
      const { code, discount_percent, max_uses } = body;
      if (!code || discount_percent == null || max_uses == null) {
        return json({ error: 'Missing promo fields' }, 400);
      }
      const { data: promo, error } = await svc.from('promo_codes').insert({
        event_id: eventId,
        code: String(code).trim().toUpperCase(),
        discount_percent: Number(discount_percent),
        max_uses: Math.round(Number(max_uses)),
        created_by: user.id,
      }).select('*').single();
      if (error) return json({ error: error.message }, 400);
      return json({ promo });
    }

    if (action === 'delete_promo') {
      const { error } = await svc.from('promo_codes').delete().eq('id', body.id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('manageTicketCatalog error:', error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
