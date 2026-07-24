import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { toMinor, toMajor, computeFeeMinor, applyDiscount } from '../../shared/tickets.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { tier_id, promo_code, promoter_code, quantity = 1, success_url, cancel_url } = await req.json();
    if (!tier_id) return Response.json({ error: 'A ticket tier is required' }, { status: 400 });

    const tier = await base44.asServiceRole.entities.TicketTier.get(tier_id);
    if (!tier) return Response.json({ error: 'Ticket tier not found' }, { status: 404 });
    if (tier.sales_status !== 'open' || Number(tier.sold || 0) >= Number(tier.quantity || 0)) {
      return Response.json({ error: 'This tier is sold out' }, { status: 400 });
    }

    const events = await base44.asServiceRole.entities.Event.filter({ id: tier.event_id });
    const event = events[0];
    if (!event) return Response.json({ error: 'Event not found' }, { status: 404 });
    const currency = String(event.currency || 'gbp').toLowerCase();

    const unitMinor = toMinor(tier.price);
    let discountPercent = 0;
    let promoRecord = null;

    if (promo_code) {
      const code = String(promo_code).trim().toUpperCase();
      const codes = await base44.asServiceRole.entities.PromoCode.filter({ event_id: tier.event_id, code });
      promoRecord = codes[0];
      if (!promoRecord) {
        return Response.json({ error: 'Invalid promo code' }, { status: 400 });
      }
      if (promoRecord.status === 'disabled') {
        return Response.json({ error: 'This promo code is no longer active' }, { status: 400 });
      }
      if (Number(promoRecord.used_count || 0) >= Number(promoRecord.max_uses || 0)) {
        return Response.json({ error: 'This promo code has reached its usage limit' }, { status: 400 });
      }
      discountPercent = Number(promoRecord.discount_percent || 0);
    }

    const { discount, paid } = applyDiscount(unitMinor, discountPercent);
    const feeMinor = computeFeeMinor(paid);
    let hostNetMinor = paid - feeMinor;

    // Promoter / affiliate attribution (last-touch, persisted client-side per event).
    // Commission is deducted from what the host actually earns, on top of the platform fee.
    let promoterRecord = null;
    let commissionMinor = 0;
    if (promoter_code) {
      const code = String(promoter_code).trim();
      const promoters = await base44.asServiceRole.entities.Promoter.filter({ event_id: tier.event_id, tracking_code: code, status: 'active' });
      promoterRecord = promoters[0] || null;
    }
    if (promoterRecord) {
      if (promoterRecord.commission_type === 'flat') {
        commissionMinor = toMinor(promoterRecord.commission_value) * quantity;
      } else {
        commissionMinor = Math.round(paid * (Number(promoterRecord.commission_value || 0) / 100));
      }
      if (commissionMinor > hostNetMinor) commissionMinor = hostNetMinor;
      hostNetMinor = hostNetMinor - commissionMinor;
    }

    const order = await base44.asServiceRole.entities.TicketOrder.create({
      event_id: tier.event_id,
      tier_id: tier.id,
      tier_name: tier.name,
      guest_email: user.email,
      guest_name: user.full_name,
      promo_code_id: promoRecord ? promoRecord.id : null,
      promo_code: promoRecord ? promoRecord.code : null,
      quantity,
      unit_price: toMajor(unitMinor),
      discount_percent: discountPercent,
      discount_amount: toMajor(discount),
      paid_amount: toMajor(paid),
      platform_fee: toMajor(feeMinor),
      host_net: toMajor(hostNetMinor),
      promoter_id: promoterRecord ? promoterRecord.id : null,
      promoter_code: promoterRecord ? promoterRecord.tracking_code : null,
      commission_amount: toMajor(commissionMinor),
      currency,
      status: 'pending',
    });

    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    const params = new URLSearchParams();
    params.append('payment_method_types[]', 'card');
    params.append('mode', 'payment');
    params.append('line_items[0][quantity]', String(quantity));
    params.append('line_items[0][price_data][currency]', currency);
    params.append('line_items[0][price_data][unit_amount]', String(paid));
    params.append('line_items[0][price_data][product_data][name]', `${event.title} — ${tier.name}`);
    // Only allow redirect URLs on this app's own origin to prevent open redirect.
    const appOrigin = new URL(req.url).origin;
    const APP_DOMAIN = "https://thedoorman.app";
    const safeRedirect = (url, fallback) => {
      if (!url) return fallback;
      try {
        const u = new URL(url);
        return (u.origin === appOrigin || u.origin === APP_DOMAIN) ? url : fallback;
      } catch {
        return fallback;
      }
    };
    const successUrl = safeRedirect(success_url, `${APP_DOMAIN}/checkout/${tier.event_id}?payment=success`);
    const cancelUrl = safeRedirect(cancel_url, `${APP_DOMAIN}/checkout/${tier.event_id}?payment=cancelled`);
    params.append('success_url', successUrl);
    params.append('cancel_url', cancelUrl);
    params.append('metadata[order_id]', order.id);
    params.append('metadata[tier_id]', tier.id);
    params.append('metadata[event_id]', tier.event_id);
    if (promoterRecord) params.append('metadata[promoter_id]', promoterRecord.id);
    params.append('metadata[base44_app_id]', Deno.env.get('BASE44_APP_ID') || '');
    params.append('customer_email', user.email);

    const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });
    const session = await sessionRes.json();
    if (!session.url) {
      console.log('Stripe checkout error', JSON.stringify(session));
      return Response.json({ error: session.error?.message || 'Failed to create checkout session' }, { status: 500 });
    }

    await base44.asServiceRole.entities.TicketOrder.update(order.id, { stripe_session_id: session.id });

    return Response.json({ url: session.url, order_id: order.id });
  } catch (error) {
    console.log('createTicketCheckout error', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});