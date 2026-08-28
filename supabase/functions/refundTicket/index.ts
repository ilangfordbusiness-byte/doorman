// Guest self-service refund: cancels one paid ticket, refunds its share of
// the order to the original payment method, revokes the QR, frees the seat,
// and emails a confirmation. Allowed until the event starts.
import { getCaller, json, preflight, serviceClient } from '../_shared/db.ts';
import { brandedEmail, detailRows, emailCard, sendEmail } from '../_shared/email.ts';
import { formatMoney } from '../_shared/tickets.ts';

// Has the event's start (Europe/London wall clock) already passed?
// deno-lint-ignore no-explicit-any
function eventStarted(event: any): boolean {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/London', year: 'numeric', month: '2-digit',
        day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(new Date()).map((p) => [p.type, p.value]),
    );
    const nowKey = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
    const startKey = `${event.date}T${String(event.start_time || '00:00').slice(0, 5)}`;
    return nowKey >= startKey;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const user = await getCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { guestlist_entry_id } = await req.json();
    if (!guestlist_entry_id) return json({ error: 'Missing ticket' }, 400);

    const { data: entry } = await svc.from('guestlist_entries').select('*')
      .eq('id', guestlist_entry_id).maybeSingle();
    if (!entry) return json({ error: 'Ticket not found.' }, 404);
    if (entry.guest_user_id !== user.id && entry.guest_email !== user.email) {
      return json({ error: "You don't own this ticket." }, 403);
    }
    if (entry.status === 'checked_in') {
      return json({ error: 'This ticket has already been used at the door.' }, 400);
    }
    if (!['approved', 'invited'].includes(entry.status)) {
      return json({ error: 'This ticket is no longer active.' }, 400);
    }
    if (!entry.order_id) {
      return json({ error: 'Only purchased tickets can be refunded.' }, 400);
    }

    const { count: pending } = await svc.from('ticket_transfers')
      .select('id', { count: 'exact', head: true })
      .eq('guestlist_entry_id', entry.id).eq('status', 'pending');
    if ((pending ?? 0) > 0) {
      return json({ error: 'This ticket has a pending transfer — cancel it first.' }, 409);
    }

    const { data: order } = await svc.from('ticket_orders').select('*')
      .eq('id', entry.order_id).single();
    if (!order || order.status !== 'paid' || !order.stripe_payment_intent_id) {
      return json({ error: 'No refundable payment found for this ticket.' }, 400);
    }

    const { data: event } = await svc.from('events').select('*')
      .eq('id', entry.event_id).single();
    if (event && eventStarted(event)) {
      return json({ error: 'This event has already started — tickets can no longer be cancelled.' }, 400);
    }

    // This ticket's share of what the buyer paid. The last refundable ticket
    // of the order sweeps any rounding remainder.
    const qty = Math.max(1, Number(order.quantity) || 1);
    const perTicket = Math.floor(Number(order.paid_minor) / qty);
    const { data: siblings } = await svc.from('guestlist_entries')
      .select('id, status').eq('order_id', order.id).neq('id', entry.id);
    const othersRefundable = (siblings ?? [])
      .filter((s) => ['approved', 'invited'].includes(s.status)).length;
    const remaining = Number(order.paid_minor) - Number(order.refunded_minor || 0);
    const amount = Math.min(remaining, othersRefundable === 0 ? remaining : perTicket);
    if (amount <= 0) return json({ error: 'Nothing left to refund on this order.' }, 400);

    const stripeKey = Deno.env.get('STRIPE_TEST_SECRET_KEY') || Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return json({ error: 'Stripe is not configured' }, 500);

    const params = new URLSearchParams();
    params.append('payment_intent', order.stripe_payment_intent_id);
    params.append('amount', String(amount));
    // Return the platform's share and pull back the host's share so every
    // party funds their own part of the refund.
    params.append('refund_application_fee', 'true');
    if (order.payout_destination) params.append('reverse_transfer', 'true');
    params.append('metadata[order_id]', order.id);
    params.append('metadata[guestlist_entry_id]', entry.id);

    const res = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });
    const refund = await res.json();
    if (!res.ok || refund.error) {
      console.log('refundTicket stripe error', JSON.stringify(refund.error ?? refund));
      return json({ error: refund.error?.message || 'The refund could not be processed.' }, 400);
    }

    // Bookkeeping after the money moved: kill the QR, free the seat, track
    // the refunded total, and flip the order once nothing refundable remains.
    // The scanner already rejects non-approved/invited statuses; rotating the
    // secret additionally invalidates any saved copy of the QR payload.
    const newSecret = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0')).join('');
    await svc.from('guestlist_entries').update({
      status: 'revoked',
      qr_secret: newSecret,
      notes: `${entry.notes ? entry.notes + ' · ' : ''}Cancelled & refunded by guest`,
    }).eq('id', entry.id);

    const refundedTotal = Number(order.refunded_minor || 0) + amount;
    await svc.from('ticket_orders').update({
      refunded_minor: refundedTotal,
      ...(othersRefundable === 0 || refundedTotal >= Number(order.paid_minor)
        ? { status: 'refunded', refunded_at: new Date().toISOString() }
        : {}),
    }).eq('id', order.id);

    // Claw back this ticket's commission share so the weekly promoter payout
    // never pays out on refunded tickets. Per-ticket share, with the last
    // refundable ticket sweeping the rounding remainder (mirrors the refund
    // amount math above); clamped so owed never dips below what's been paid.
    if (order.promoter_id && Number(order.commission_minor) > 0) {
      const perTicketComm = Math.floor(Number(order.commission_minor) / qty);
      const claw = othersRefundable === 0
        ? Number(order.commission_minor) - perTicketComm * (qty - 1)
        : perTicketComm;
      const { data: prom } = await svc.from('promoters')
        .select('commission_owed_minor, commission_paid_minor')
        .eq('id', order.promoter_id).maybeSingle();
      if (prom) {
        const floorMinor = Number(prom.commission_paid_minor || 0);
        const next = Math.max(floorMinor, Number(prom.commission_owed_minor) - claw);
        await svc.from('promoters').update({ commission_owed_minor: next })
          .eq('id', order.promoter_id);
      }
    }

    if (order.tier_id) {
      const { data: tier } = await svc.from('ticket_tiers').select('*')
        .eq('id', order.tier_id).single();
      if (tier) {
        const sold = Math.max(0, Number(tier.sold) - 1);
        await svc.from('ticket_tiers').update({
          sold,
          ...(tier.sales_status === 'sold_out' && sold < Number(tier.quantity)
            ? { sales_status: 'open' } : {}),
        }).eq('id', tier.id);
      }
    }

    // Confirmation email — non-blocking.
    try {
      const money = formatMoney(amount, order.currency || 'gbp');
      await sendEmail({
        to: entry.guest_email,
        subject: `Your ticket for ${event?.title ?? 'the event'} was cancelled`,
        html: brandedEmail({
          kicker: 'Ticket Cancelled',
          title: event?.title ?? 'Your event',
          subtitle: entry.guest_name ? `Hi ${entry.guest_name},` : undefined,
          bodyHtml: emailCard('Refund', detailRows([
            ['Amount', money],
            ['Refunded to', 'your original payment method'],
            ['Arrives', 'within 5–10 business days'],
          ])),
          footnote: 'This ticket and its QR code are no longer valid for entry.',
        }),
      });
    } catch (e) {
      console.log('refundTicket email error', e instanceof Error ? e.message : String(e));
    }

    return json({ ok: true, refunded_minor: amount });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('refundTicket error', msg);
    return json({ error: msg }, 500);
  }
});
