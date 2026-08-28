// Creates a Stripe Checkout session for a ticket purchase. Port of the original app
// createTicketCheckout function; amounts are minor units natively now.
import { getCaller, json, preflight, serviceClient } from '../_shared/db.ts';
import {
  computeFeeMinor, computePromoterDiscountMinor, MIN_PAID_MINOR,
  promoterDiscountAvailable,
} from '../_shared/tickets.ts';
import { PAYOUT_SETUP_ERROR, resolvePayoutAccount } from '../_shared/connect.ts';

function allowedOrigins(req: Request): string[] {
  const extra = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get('origin');
  const list = [Deno.env.get('APP_ORIGIN') || 'https://thedoorman.app', ...extra];
  if (origin && list.includes(origin)) return [origin, ...list];
  return list;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const user = await getCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { tier_id, promo_code, promoter_code, quantity = 1, success_url, cancel_url } =
      await req.json();
    if (!tier_id) return json({ error: 'A ticket tier is required' }, 400);
    const qty = Math.max(1, Math.round(Number(quantity) || 1));

    const { data: tier } = await svc.from('ticket_tiers').select('*').eq('id', tier_id).single();
    if (!tier) return json({ error: 'Ticket tier not found' }, 404);
    if (tier.sales_status !== 'open' || tier.sold >= tier.quantity) {
      return json({ error: 'This tier is sold out' }, 400);
    }

    const { data: event } = await svc.from('events').select('*').eq('id', tier.event_id).single();
    if (!event) return json({ error: 'Event not found' }, 404);
    const currency = String(event.currency || 'gbp').toLowerCase();

    // Paid tickets require a payout-ready host: the host's share is routed to
    // their connected account inside the payment itself (destination charge),
    // so host money never accumulates on the platform balance.
    const payout = await resolvePayoutAccount(svc, event);
    if (!payout.active) return json({ error: PAYOUT_SETUP_ERROR }, 400);

    const unitMinor = Number(tier.price_minor);

    // Promoter attribution (last-touch, persisted client-side per event).
    let promoter = null;
    if (promoter_code) {
      const { data } = await svc.from('promoters').select('*')
        .eq('event_id', tier.event_id)
        .eq('tracking_code', String(promoter_code).trim())
        .eq('status', 'active')
        .maybeSingle();
      promoter = data;
    }
    let promoterDiscountMinor = 0;
    if (promoter && promoterDiscountAvailable(promoter)) {
      promoterDiscountMinor = computePromoterDiscountMinor(unitMinor, promoter);
    }

    // Promo code discount (percent of face value) on top of the promoter discount.
    let discountPercent = 0;
    let promo = null;
    if (promo_code) {
      const { data } = await svc.from('promo_codes').select('*')
        .eq('event_id', tier.event_id)
        .eq('code', String(promo_code).trim().toUpperCase())
        .maybeSingle();
      promo = data;
      if (!promo) return json({ error: 'Invalid promo code' }, 400);
      if (promo.status === 'disabled') {
        return json({ error: 'This promo code is no longer active' }, 400);
      }
      if (promo.used_count >= promo.max_uses) {
        return json({ error: 'This promo code has reached its usage limit' }, 400);
      }
      discountPercent = Number(promo.discount_percent || 0);
    }
    const promoDiscountMinor = promo ? Math.round(unitMinor * (discountPercent / 100)) : 0;

    // Combine discounts; floor paid at the platform minimum, trimming the promo
    // portion first (the promoter discount is the primary, auto-applied one).
    const capDiscount = Math.max(0, unitMinor - MIN_PAID_MINOR);
    let promoDiscountFinal = promoDiscountMinor;
    let totalDiscountMinor = promoterDiscountMinor + promoDiscountFinal;
    if (totalDiscountMinor > capDiscount) {
      promoDiscountFinal = Math.max(0, capDiscount - promoterDiscountMinor);
      totalDiscountMinor = promoterDiscountMinor + promoDiscountFinal;
    }
    const paid = unitMinor - totalDiscountMinor; // per ticket

    // Order-level money. The platform fee applies per ticket sold; all stored
    // amounts below are totals for the whole order (unit_price_minor stays
    // per-unit), which is what analytics/admin metrics sum as revenue.
    const orderPaidMinor = paid * qty;
    const feeMinor = computeFeeMinor(paid) * qty;
    let hostNetMinor = orderPaidMinor - feeMinor;

    // Commission comes out of the host's net, computed on the discounted price.
    let commissionMinor = 0;
    if (promoter) {
      commissionMinor = promoter.commission_type === 'flat'
        ? Number(promoter.commission_flat_minor || 0) * qty
        : Math.round(orderPaidMinor * (Number(promoter.commission_percent || 0) / 100));
      if (commissionMinor > hostNetMinor) commissionMinor = hostNetMinor;
      hostNetMinor -= commissionMinor;
    }

    const { data: order, error: orderErr } = await svc.from('ticket_orders').insert({
      event_id: tier.event_id,
      tier_id: tier.id,
      guest_user_id: user.id,
      guest_email: user.email,
      guest_name: user.full_name,
      promo_code_id: promo?.id ?? null,
      promoter_id: promoter?.id ?? null,
      quantity: qty,
      unit_price_minor: unitMinor,
      discount_minor: totalDiscountMinor * qty,
      promoter_discount_minor: promoterDiscountMinor * qty,
      paid_minor: orderPaidMinor,
      platform_fee_minor: feeMinor,
      commission_minor: commissionMinor,
      host_net_minor: hostNetMinor,
      currency,
      status: 'pending',
      payout_destination: payout.accountId,
    }).select('*').single();
    if (orderErr || !order) throw new Error(orderErr?.message || 'Failed to create order');

    const stripeKey = Deno.env.get('STRIPE_TEST_SECRET_KEY') || Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return json({ error: 'Stripe is not configured' }, 500);

    // Redirects restricted to known origins (open-redirect guard).
    const origins = allowedOrigins(req);
    const safeRedirect = (url: string | undefined, fallback: string) => {
      if (!url) return fallback;
      try {
        return origins.includes(new URL(url).origin) ? url : fallback;
      } catch {
        return fallback;
      }
    };
    const base = origins[0];
    const successUrl = safeRedirect(success_url, `${base}/event/${tier.event_id}?payment=success`);
    const cancelUrl = safeRedirect(cancel_url, `${base}/event/${tier.event_id}?payment=cancelled`);

    const params = new URLSearchParams();
    // Opt out of Managed Payments (on by default for new Stripe accounts): it
    // is a digital-products merchant-of-record mode that does not support
    // Connect platforms, and it rejects standard params like
    // payment_method_types. Payment methods come from the dashboard config.
    params.append('managed_payments[enabled]', 'false');
    params.append('mode', 'payment');
    // Destination charge: Stripe transfers the host's share to their connected
    // account on payment; the application fee (platform cut + any promoter
    // commission, paid out manually) stays on the platform balance.
    params.append('payment_intent_data[transfer_data][destination]', String(payout.accountId));
    params.append('payment_intent_data[application_fee_amount]', String(feeMinor + commissionMinor));
    params.append('line_items[0][quantity]', String(qty));
    params.append('line_items[0][price_data][currency]', currency);
    params.append('line_items[0][price_data][unit_amount]', String(paid));
    params.append('line_items[0][price_data][product_data][name]', `${event.title} — ${tier.name}`);
    params.append('success_url', successUrl);
    params.append('cancel_url', cancelUrl);
    params.append('metadata[order_id]', order.id);
    params.append('metadata[tier_id]', tier.id);
    params.append('metadata[event_id]', tier.event_id);
    if (promoter) params.append('metadata[promoter_id]', promoter.id);
    params.append('customer_email', user.email);

    const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });
    const session = await sessionRes.json();
    if (!session.url) {
      console.log('Stripe checkout error', JSON.stringify(session));
      return json({ error: session.error?.message || 'Failed to create checkout session' }, 500);
    }

    await svc.from('ticket_orders').update({ stripe_session_id: session.id }).eq('id', order.id);

    return json({ url: session.url, order_id: order.id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('createTicketCheckout error', msg);
    return json({ error: msg }, 500);
  }
});
