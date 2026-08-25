// Validates a typed promo code for a tier and quotes the discounted price.
// (Guests can't read promo_codes directly — codes are secrets.)
import { getCaller, json, preflight, serviceClient } from '../_shared/db.ts';
import { applyDiscount, currencySymbol, toMajor } from '../_shared/tickets.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const user = await getCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { event_id, code, tier_id } = await req.json();
    if (!event_id || !code || !tier_id) return json({ error: 'Missing fields' }, 400);

    const { data: promo } = await svc.from('promo_codes').select('*')
      .eq('event_id', event_id)
      .eq('code', String(code).trim().toUpperCase())
      .maybeSingle();
    if (!promo) return json({ valid: false, message: 'Invalid promo code' });
    if (promo.status === 'disabled') {
      return json({ valid: false, message: 'This promo code is no longer active' });
    }
    if (promo.used_count >= promo.max_uses) {
      return json({ valid: false, message: 'This promo code has reached its usage limit' });
    }

    const { data: tier } = await svc.from('ticket_tiers').select('*').eq('id', tier_id).single();
    if (!tier) return json({ valid: false, message: 'Tier not found' });

    const { data: event } = await svc.from('events').select('currency').eq('id', event_id).single();
    const cur = String(event?.currency || 'gbp').toLowerCase();

    const { discount, paid } = applyDiscount(tier.price_minor, promo.discount_percent);

    return json({
      valid: true,
      discount_percent: Number(promo.discount_percent),
      discount_amount: toMajor(discount),
      paid_amount: toMajor(paid),
      currency: cur,
      symbol: currencySymbol(cur),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('validatePromoCode error', msg);
    return json({ error: msg }, 500);
  }
});
