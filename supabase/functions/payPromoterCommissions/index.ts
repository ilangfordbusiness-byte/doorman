// Weekly promoter commission payouts. Triggered by pg_cron every Monday;
// guarded by AUTOMATION_SECRET. verify_jwt=false — the secret header is the
// authentication.
//
// Pays each promoter their accrued commissions from events that have ENDED
// (guest refunds close at event start, so these amounts are final), batched
// into one Stripe transfer per person and currency, with a £10 minimum —
// smaller balances roll over. The platform absorbs the transfer fees.
// Promoters without a payout-ready Stripe account simply keep accruing.
import { hasAutomationSecret, json, serviceClient } from '../_shared/db.ts';
import { eventEnded } from '../_shared/eventTime.ts';

const THRESHOLD_MINOR = 1000; // 10 major units of the row's currency (£10 / €10 / $10)

Deno.serve(async (req) => {
  try {
    if (!hasAutomationSecret(req)) return json({ error: 'Unauthorized' }, 401);
    const svc = serviceClient();
    const stripeKey = Deno.env.get('STRIPE_TEST_SECRET_KEY') || Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return json({ error: 'Stripe is not configured' }, 500);

    const { data: rows } = await svc.from('promoters')
      .select('id, user_id, email, commission_owed_minor, commission_paid_minor,' +
        ' events!inner(id, date, start_time, end_time, timezone, currency)')
      .gt('commission_owed_minor', 0);
    const now = new Date();
    // deno-lint-ignore no-explicit-any
    const due = (rows ?? []).filter((r: any) =>
      Number(r.commission_owed_minor) > Number(r.commission_paid_minor) &&
      eventEnded(r.events, now)
    );
    if (!due.length) return json({ ok: true, paid: 0, skipped: 'nothing due' });

    // Resolve each promoter row to a profile (linked user first, email second).
    const emails = [...new Set(due.map((r) => r.email).filter(Boolean))];
    const ids = [...new Set(due.map((r) => r.user_id).filter(Boolean))];
    const { data: profiles } = await svc.from('profiles')
      .select('id, email, stripe_account_id, stripe_onboarding_status')
      .or([
        ids.length ? `id.in.(${ids.join(',')})` : null,
        emails.length ? `email.in.(${emails.map((e) => `"${e}"`).join(',')})` : null,
      ].filter(Boolean).join(','));
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    const byEmail = new Map((profiles ?? []).map((p) => [String(p.email).toLowerCase(), p]));

    // Group unpaid amounts by (profile, currency).
    type Group = { profile: { id: string; stripe_account_id: string | null; stripe_onboarding_status: string };
      currency: string; amount: number; rows: { id: string; share: number }[] };
    const groups = new Map<string, Group>();
    let skippedNoStripe = 0;
    for (const r of due) {
      const profile = (r.user_id && byId.get(r.user_id)) ||
        (r.email && byEmail.get(String(r.email).toLowerCase())) || null;
      if (!profile || !profile.stripe_account_id || profile.stripe_onboarding_status !== 'active') {
        skippedNoStripe++;
        continue;
      }
      const currency = String(r.events?.currency || 'gbp').toLowerCase();
      const share = Number(r.commission_owed_minor) - Number(r.commission_paid_minor);
      const key = `${profile.id}:${currency}`;
      const g = groups.get(key) ?? { profile, currency, amount: 0, rows: [] };
      g.amount += share;
      g.rows.push({ id: r.id, share });
      groups.set(key, g);
    }

    let paid = 0, failed = 0, belowThreshold = 0;
    for (const g of groups.values()) {
      if (g.amount < THRESHOLD_MINOR) { belowThreshold++; continue; }

      // Payout row first, then the transfer keyed on it — a crash or retry can
      // never double-pay (Stripe dedupes on the idempotency key).
      const { data: payout, error: payoutErr } = await svc.from('payouts').insert({
        user_id: g.profile.id, role: 'promoter', amount_minor: g.amount,
        currency: g.currency, status: 'pending',
      }).select('id').single();
      if (payoutErr || !payout) { failed++; continue; }

      const params = new URLSearchParams();
      params.append('amount', String(g.amount));
      params.append('currency', g.currency);
      params.append('destination', String(g.profile.stripe_account_id));
      params.append('description', 'DoorMan promoter commissions');
      params.append('metadata[payout_id]', payout.id);
      const res = await fetch('https://api.stripe.com/v1/transfers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': `promoter-payout-${payout.id}`,
        },
        body: params,
      });
      const transfer = await res.json();
      if (!res.ok || transfer.error) {
        console.log('payPromoterCommissions transfer error',
          JSON.stringify(transfer.error ?? transfer));
        await svc.from('payouts').update({ status: 'failed' }).eq('id', payout.id);
        failed++;
        continue;
      }

      await svc.from('payouts').update({
        status: 'paid', stripe_transfer_id: transfer.id,
      }).eq('id', payout.id);
      for (const row of g.rows) {
        const { data: current } = await svc.from('promoters')
          .select('commission_paid_minor').eq('id', row.id).single();
        await svc.from('promoters').update({
          commission_paid_minor: Number(current?.commission_paid_minor ?? 0) + row.share,
        }).eq('id', row.id);
      }
      paid++;
    }

    return json({ ok: true, paid, failed, below_threshold: belowThreshold,
      no_stripe: skippedNoStripe });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('payPromoterCommissions error', msg);
    return json({ error: msg }, 500);
  }
});
