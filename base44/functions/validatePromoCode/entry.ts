import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { toMinor, toMajor, applyDiscount, currencySymbol } from '../../shared/tickets.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { event_id, code, tier_id } = await req.json();
    if (!event_id || !code || !tier_id) {
      return Response.json({ error: 'Missing fields' }, { status: 400 });
    }

    const codes = await base44.asServiceRole.entities.PromoCode.filter({
      event_id,
      code: String(code).trim().toUpperCase(),
    });
    const promo = codes[0];
    if (!promo) return Response.json({ valid: false, message: 'Invalid promo code' });

    if (promo.status === 'disabled') {
      return Response.json({ valid: false, message: 'This promo code is no longer active' });
    }
    if (Number(promo.used_count || 0) >= Number(promo.max_uses || 0)) {
      return Response.json({ valid: false, message: 'This promo code has reached its usage limit' });
    }

    const tier = await base44.asServiceRole.entities.TicketTier.get(tier_id);
    if (!tier) return Response.json({ valid: false, message: 'Tier not found' });

    const events = await base44.asServiceRole.entities.Event.filter({ id: event_id });
    const cur = String(events[0]?.currency || 'gbp').toLowerCase();

    const unitMinor = toMinor(tier.price);
    const { discount, paid } = applyDiscount(unitMinor, promo.discount_percent);

    return Response.json({
      valid: true,
      discount_percent: Number(promo.discount_percent),
      discount_amount: toMajor(discount),
      paid_amount: toMajor(paid),
      currency: cur,
      symbol: currencySymbol(cur),
    });
  } catch (error) {
    console.log('validatePromoCode error', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});