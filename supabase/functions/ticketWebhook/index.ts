// Stripe webhook: on checkout.session.completed, marks the order paid, issues
// the guestlist entry (the ticket), updates counters atomically, emails the QR.
// verify_jwt=false — authentication is the Stripe signature.
import { json, serviceClient } from '../_shared/db.ts';
import { sendTicketConfirmationEmail } from '../_shared/tickets.ts';

// The tier sold out before this payment landed: refund it in full (no seat to
// give) and mark the order refunded. The Idempotency-Key makes a Stripe retry
// safe; on a refund failure we release the claim so the retry tries again
// rather than stranding a paid-but-seatless order.
// deno-lint-ignore no-explicit-any
async function refundSoldOut(svc: any, order: any, session: any): Promise<void> {
  const stripeKey = Deno.env.get('STRIPE_TEST_SECRET_KEY') || Deno.env.get('STRIPE_SECRET_KEY');
  const pi = order.stripe_payment_intent_id || session.payment_intent;
  if (stripeKey && pi) {
    const params = new URLSearchParams();
    params.append('payment_intent', pi);
    params.append('refund_application_fee', 'true');
    if (order.payout_destination) params.append('reverse_transfer', 'true');
    params.append('metadata[order_id]', order.id);
    params.append('metadata[reason]', 'sold_out');
    const res = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `soldout-refund-${order.id}`,
      },
      body: params,
    });
    const refund = await res.json();
    if (!res.ok || refund.error) {
      await svc.from('ticket_orders')
        .update({ status: 'pending', stripe_payment_intent_id: null }).eq('id', order.id);
      throw new Error(refund.error?.message || 'sold-out refund failed');
    }
  }
  await svc.from('ticket_orders').update({
    status: 'refunded',
    refunded_at: new Date().toISOString(),
    refunded_minor: order.paid_minor,
  }).eq('id', order.id);
}

async function verifyStripeSignature(rawBody: string, sigHeader: string, secret: string) {
  const parts = (sigHeader || '').split(',').map((p) => p.trim());
  let t: string | null = null;
  const sigs: string[] = [];
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx);
    const v = part.slice(idx + 1);
    if (k === 't') t = v;
    else if (k === 'v1') sigs.push(v);
  }
  if (!t || sigs.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBuf = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(`${t}.${rawBody}`),
  );
  const expected = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return sigs.includes(expected);
}

Deno.serve(async (req) => {
  try {
    const rawBody = await req.text();
    const sigHeader = req.headers.get('stripe-signature') || '';
    // Accept live + test secrets so one endpoint serves both Stripe modes.
    const secrets = [
      Deno.env.get('STRIPE_TEST_WEBHOOK_SECRET'),
      Deno.env.get('STRIPE_WEBHOOK_SECRET'),
    ].filter(Boolean) as string[];
    if (!secrets.length) {
      console.log('ticketWebhook: no webhook secret configured');
      return json({ error: 'Webhook secret not configured' }, 500);
    }
    let ok = false;
    for (const s of secrets) {
      if (await verifyStripeSignature(rawBody, sigHeader, s)) { ok = true; break; }
    }
    if (!ok) return json({ error: 'Invalid signature' }, 400);

    const stripeEvent = JSON.parse(rawBody);
    if (stripeEvent.type !== 'checkout.session.completed') return json({ received: true });

    const session = stripeEvent.data.object;
    const orderId = session.metadata?.order_id;
    if (!orderId) return json({ received: true });

    const svc = serviceClient();

    // Atomically claim the order: only the delivery that flips pending -> paid
    // proceeds. Stripe delivers duplicates and retries, so the previous
    // read-then-write status check could let two concurrent deliveries both
    // fulfil (double tickets + double promoter commission). The conditional
    // update makes fulfilment exactly-once.
    const { data: claimed, error: claimErr } = await svc.from('ticket_orders')
      .update({ status: 'paid', stripe_payment_intent_id: session.payment_intent || '' })
      .eq('id', orderId).eq('status', 'pending')
      .select('*');
    if (claimErr) throw new Error(claimErr.message);
    if (!claimed || !claimed.length) return json({ received: true }); // already handled
    const order = claimed[0];

    // Capacity gate: atomically grant the purchased seats. If the tier sold out
    // first (concurrent buyers racing for the last seats), there is no seat for
    // this payment — refund it in full and issue no ticket. Free tiers (no
    // tier_id) have no seat cap here.
    let granted = false;
    if (order.tier_id) {
      const grant = await svc.rpc('grant_tier_seats', { p_tier: order.tier_id, p_qty: order.quantity });
      if (grant.error) throw new Error(grant.error.message); // unknown state — let Stripe retry
      if (grant.data === false) {
        await refundSoldOut(svc, order, session);
        return json({ received: true });
      }
      granted = true;
    }

    const { data: tier } = order.tier_id
      ? await svc.from('ticket_tiers').select('name').eq('id', order.tier_id).single()
      : { data: null };

    // Issue one ticket (entry + QR) per seat purchased. qr_secret comes from
    // the column default. This is the critical exactly-once step: if it fails,
    // release the claim (back to pending) so Stripe's retry reprocesses cleanly
    // — no entries exist yet, so there is nothing to duplicate.
    const qty = Math.max(1, Number(order.quantity) || 1);
    const rows = Array.from({ length: qty }, (_, i) => ({
      event_id: order.event_id,
      order_id: order.id,
      guest_user_id: order.guest_user_id,
      guest_email: order.guest_email,
      guest_name: qty > 1 ? `${order.guest_name} (${i + 1} of ${qty})` : order.guest_name,
      status: 'approved',
      source: 'request',
      notes: `Paid ticket — ${tier?.name ?? ''}${qty > 1 ? ` (${i + 1} of ${qty})` : ''}`,
    }));
    let entries;
    try {
      const res = await svc.from('guestlist_entries').insert(rows).select('*');
      if (res.error || !res.data?.length) throw new Error(res.error?.message || 'Failed to create entries');
      entries = res.data;
    } catch (e) {
      // Give the granted seats back so the retry doesn't double-count them.
      if (granted) {
        await svc.rpc('release_tier_seats', { p_tier: order.tier_id, p_qty: order.quantity });
      }
      await svc.from('ticket_orders')
        .update({ status: 'pending', stripe_payment_intent_id: null })
        .eq('id', order.id);
      throw e;
    }

    // Side effects below run exactly once (the claim guaranteed it) but are
    // best-effort: the order is paid and the ticket issued, so a failure here
    // must not undo that or trigger reprocessing. Log and continue.
    const link = await svc.from('ticket_orders')
      .update({ guestlist_entry_id: entries[0].id }).eq('id', order.id);
    if (link.error) console.log('ticketWebhook link entry error', link.error.message);

    // Tier `sold` was already incremented by grant_tier_seats above.
    if (order.promo_code_id) {
      const r = await svc.rpc('record_promo_use', {
        p_promo: order.promo_code_id, p_discount_minor: order.discount_minor,
      });
      if (r.error) console.log('record_promo_use error', r.error.message);
    }
    if (order.promoter_id) {
      const r = await svc.rpc('record_promoter_sale', {
        p_promoter: order.promoter_id,
        p_qty: order.quantity,
        p_paid_minor: order.paid_minor,
        p_commission_minor: order.commission_minor,
        p_promoter_discount_minor: order.promoter_discount_minor,
      });
      if (r.error) console.log('record_promoter_sale error', r.error.message);
    }

    // Ticket email (all QRs in one email) — non-blocking.
    try {
      const { data: event } = await svc.from('events').select('*').eq('id', order.event_id).single();
      if (event) await sendTicketConfirmationEmail(svc, entries, event, tier?.name ?? null);
    } catch (e) {
      console.log('ticketWebhook email send error', e instanceof Error ? e.message : String(e));
    }

    return json({ received: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('ticketWebhook error', msg);
    return json({ error: msg }, 500);
  }
});
