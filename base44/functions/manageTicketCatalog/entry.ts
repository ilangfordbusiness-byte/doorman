import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;
    const srv = base44.asServiceRole;

    // Resolve the event_id for the action (for deletes, look it up from the record)
    let eventId = body.event_id;
    if ((action === 'delete_tier' || action === 'delete_promo') && !eventId && body.id) {
      const entityName = action === 'delete_tier' ? 'TicketTier' : 'PromoCode';
      const rec = await srv.entities[entityName].get(body.id);
      eventId = rec?.event_id;
    }
    if (!eventId) return Response.json({ error: 'Missing event_id' }, { status: 400 });

    // Verify the caller owns the event
    const evt = await srv.entities.Event.get(eventId);
    if (!evt) return Response.json({ error: 'Event not found' }, { status: 404 });
    if (evt.host_email !== user.email) {
      return Response.json({ error: 'Only the event host can manage the ticket catalog' }, { status: 403 });
    }

    if (action === 'create_tier') {
      const { name, price, quantity } = body;
      if (!name || price == null || quantity == null) {
        return Response.json({ error: 'Missing tier fields' }, { status: 400 });
      }
      const tier = await srv.entities.TicketTier.create({
        event_id: eventId,
        name,
        price: Number(price),
        quantity: Number(quantity),
        sold: 0,
        sales_status: 'open',
        sort_order: body.sort_order ?? 0,
      });
      return Response.json({ tier });
    }

    if (action === 'delete_tier') {
      await srv.entities.TicketTier.delete(body.id);
      return Response.json({ ok: true });
    }

    if (action === 'create_promo') {
      const { code, discount_percent, max_uses } = body;
      if (!code || discount_percent == null || max_uses == null) {
        return Response.json({ error: 'Missing promo fields' }, { status: 400 });
      }
      const promo = await srv.entities.PromoCode.create({
        event_id: eventId,
        code: String(code).trim().toUpperCase(),
        discount_percent: Number(discount_percent),
        max_uses: Number(max_uses),
        used_count: 0,
        total_discount_given: 0,
        status: 'active',
      });
      return Response.json({ promo });
    }

    if (action === 'delete_promo') {
      await srv.entities.PromoCode.delete(body.id);
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('manageTicketCatalog error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});