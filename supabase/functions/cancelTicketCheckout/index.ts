// Buyer backed out of Stripe Checkout: cancel their pending order right away
// so the seats it was holding go back on sale, instead of waiting for the
// session to expire. Only the order's owner may cancel it, and only while it
// is still pending; a paid order is untouched (refunds are a separate flow).
//
// The iOS app calls this on a heuristic ("the Stripe sheet closed and the
// order is still pending"), so before cancelling we ask Stripe whether the
// session was actually paid. Cancelling a paid-but-not-yet-webhooked order
// would leave the buyer charged with no ticket: ticketWebhook only fulfils
// orders it finds in `pending`.
import { getCaller, json, preflight, serviceClient } from '../_shared/db.ts';

const STRIPE_VERSION = '2025-10-29.clover';

async function stripeSessionPaid(key: string, sessionId: string): Promise<boolean | null> {
  try {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': STRIPE_VERSION },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const s = await res.json();
    return s.payment_status === 'paid' || s.status === 'complete';
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const user = await getCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { order_id } = await req.json();
    if (!order_id) return json({ error: 'Missing order_id' }, 400);

    const { data: order } = await svc.from('ticket_orders')
      .select('id, status, guest_user_id, stripe_session_id')
      .eq('id', order_id).maybeSingle();
    if (!order || order.guest_user_id !== user.id) return json({ error: 'Order not found' }, 404);
    if (order.status !== 'pending') return json({ ok: true, status: order.status });

    const stripeKey = Deno.env.get('STRIPE_TEST_SECRET_KEY') || Deno.env.get('STRIPE_SECRET_KEY');
    if (stripeKey && order.stripe_session_id) {
      const paid = await stripeSessionPaid(stripeKey, order.stripe_session_id);
      // Paid on Stripe's side, webhook still in flight: leave the order alone.
      if (paid) return json({ ok: true, status: 'paid_pending_webhook' });
    }

    const { data: cancelled, error } = await svc.rpc('cancel_pending_ticket_order', { p_order: order.id });
    if (error) return json({ error: error.message }, 400);

    // Best effort: expire the Stripe session too, so a stale tab can't pay
    // for seats that have been released.
    if (cancelled && stripeKey && order.stripe_session_id) {
      try {
        await fetch(`https://api.stripe.com/v1/checkout/sessions/${order.stripe_session_id}/expire`, {
          method: 'POST', headers: { Authorization: `Bearer ${stripeKey}` },
        });
      } catch (e) {
        console.log('cancelTicketCheckout: stripe expire failed', e instanceof Error ? e.message : String(e));
      }
    }
    return json({ ok: true, status: 'cancelled' });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
