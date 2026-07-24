import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Verify a Stripe webhook signature using Web Crypto (async SubtleCrypto).
async function verifyStripeSignature(rawBody, sigHeader, secret) {
  const parts = (sigHeader || '').split(',').map((p) => p.trim());
  let t = null;
  const sigs = [];
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx);
    const v = part.slice(idx + 1);
    if (k === 't') t = v;
    else if (k === 'v1') sigs.push(v);
  }
  if (!t || sigs.length === 0) return false;
  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (age > 300) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const data = new TextEncoder().encode(`${t}.${rawBody}`);
  const sigBuf = await crypto.subtle.sign('HMAC', key, data);
  const expected = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return sigs.includes(expected);
}

Deno.serve(async (req) => {
  try {
    const rawBody = await req.text();
    const sigHeader = req.headers.get('stripe-signature') || '';
    const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!secret) {
      console.log('ticketWebhook: STRIPE_WEBHOOK_SECRET not set');
      return Response.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }
    const ok = await verifyStripeSignature(rawBody, sigHeader, secret);
    if (!ok) return Response.json({ error: 'Invalid signature' }, { status: 400 });

    const stripeEvent = JSON.parse(rawBody);
    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      const orderId = session.metadata?.order_id;
      if (!orderId) return Response.json({ received: true });

      const base44 = createClientFromRequest(req);
      const order = await base44.asServiceRole.entities.TicketOrder.get(orderId);
      if (!order || order.status === 'paid') return Response.json({ received: true });

      // Increment tier sold count and mark sold out if reached capacity
      if (order.tier_id) {
        const tier = await base44.asServiceRole.entities.TicketTier.get(order.tier_id);
        if (tier) {
          const newSold = Number(tier.sold || 0) + Number(order.quantity || 1);
          const patch = { sold: newSold };
          if (newSold >= Number(tier.quantity || 0)) patch.sales_status = 'sold_out';
          await base44.asServiceRole.entities.TicketTier.update(tier.id, patch);
        }
      }

      // Increment promo code usage and discount totals
      if (order.promo_code_id) {
        const promo = await base44.asServiceRole.entities.PromoCode.get(order.promo_code_id);
        if (promo) {
          const used = Number(promo.used_count || 0) + 1;
          const patch = {
            used_count: used,
            total_discount_given: Number(promo.total_discount_given || 0) + Number(order.discount_amount || 0),
          };
          if (used >= Number(promo.max_uses || 0)) patch.status = 'exhausted';
          await base44.asServiceRole.entities.PromoCode.update(promo.id, patch);
        }
      }

      // Create a guestlist entry (approved) tied to the existing QR system
      const qr_secret = Math.random().toString(36).substring(2, 18);
      const entry = await base44.asServiceRole.entities.GuestlistEntry.create({
        event_id: order.event_id,
        guest_email: order.guest_email,
        guest_name: order.guest_name,
        status: 'approved',
        source: 'request',
        qr_secret,
        notes: `Paid ticket — ${order.tier_name}`,
      });

      await base44.asServiceRole.entities.TicketOrder.update(order.id, {
        status: 'paid',
        stripe_payment_intent_id: session.payment_intent || '',
        guestlist_entry_id: entry.id,
      });

      // Update promoter running totals on confirmed payment
      if (order.promoter_id) {
        try {
          const promoter = await base44.asServiceRole.entities.Promoter.get(order.promoter_id);
          if (promoter) {
            await base44.asServiceRole.entities.Promoter.update(promoter.id, {
              tickets_sold: Number(promoter.tickets_sold || 0) + Number(order.quantity || 1),
              total_sales: Number(promoter.total_sales || 0) + Number(order.paid_amount || 0),
              commission_owed: Number(promoter.commission_owed || 0) + Number(order.commission_amount || 0),
            });
          }
        } catch (e) {
          console.log('ticketWebhook promoter update error', e.message);
        }
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.log('ticketWebhook error', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});