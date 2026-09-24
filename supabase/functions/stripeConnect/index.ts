// Stripe Connect: host/business/promoter onboarding, dashboard links, status +
// balances. Port of the original app stripeConnect function; profiles/business rows
// replace the original app user object, balances are computed from *_minor columns.
import { getCaller, json, preflight, serviceClient } from '../_shared/db.ts';
import { toMajor } from '../_shared/tickets.ts';
import { allowedOrigins, safeRedirect } from '../_shared/origins.ts';

const STRIPE_VERSION = '2025-10-29.clover';

// deno-lint-ignore no-explicit-any
async function stripeApi(path: string, opts: { method?: string; body?: string } = {}): Promise<any> {
  // Test-first, like every other Stripe function: while STRIPE_TEST_SECRET_KEY
  // is set the whole stack runs coherently in test mode (test checkout can only
  // route to test-mode connected accounts); unsetting it flips everything live.
  const key = Deno.env.get('STRIPE_TEST_SECRET_KEY') || Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('Stripe is not configured');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    'Stripe-Version': STRIPE_VERSION,
  };
  if (opts.body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: opts.method || 'GET', headers, body: opts.body,
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message || `Stripe error ${res.status}`);
  return j;
}

function formEncode(obj: Record<string, string | undefined | null>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join('&');
}

// Country for a new connected account. Stripe fixes an account's country at
// creation (it can never change), and without one it inherits the platform's
// — which stranded non-UK hosts on a GB account they could not onboard. The
// client asks the host; if the body carries no usable code we infer one from
// the dial code of their stored E.164 phone, then fall back to GB.
const DIAL_TO_COUNTRY: [string, string][] = [
  ['+1', 'US'], ['+44', 'GB'], ['+353', 'IE'], ['+33', 'FR'], ['+49', 'DE'],
  ['+34', 'ES'], ['+39', 'IT'], ['+351', 'PT'], ['+31', 'NL'], ['+32', 'BE'],
  ['+43', 'AT'], ['+41', 'CH'], ['+45', 'DK'], ['+46', 'SE'], ['+47', 'NO'],
  ['+358', 'FI'], ['+48', 'PL'], ['+420', 'CZ'], ['+30', 'GR'], ['+40', 'RO'],
  ['+36', 'HU'], ['+971', 'AE'], ['+61', 'AU'], ['+64', 'NZ'], ['+91', 'IN'],
  ['+234', 'NG'], ['+27', 'ZA'], ['+55', 'BR'],
];
function countryFromPhone(phone: unknown): string | null {
  const p = String(phone ?? '').trim();
  if (!p.startsWith('+')) return null;
  let best: [string, string] | null = null;
  for (const entry of DIAL_TO_COUNTRY) {
    if (p.startsWith(entry[0]) && (!best || entry[0].length > best[0].length)) best = entry;
  }
  return best ? best[1] : null;
}
function resolveCountry(requested: unknown, phone: unknown): string {
  const code = String(requested ?? '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) return code;
  return countryFromPhone(phone) ?? 'GB';
}

// The two account facts we persist beside stripe_account_id.
// deno-lint-ignore no-explicit-any
function accountFacts(acct: any): { stripe_account_country: string; stripe_default_currency: string } {
  return {
    stripe_account_country: String(acct.country || 'GB').toUpperCase(),
    stripe_default_currency: String(acct.default_currency || 'gbp').toLowerCase(),
  };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const user = await getCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const body = await req.json().catch(() => ({}));
    const { action } = body;
    // Where Stripe sends the user back after onboarding/dashboard. Only
    // allow-listed origins: a raw Origin header could be anything (and the
    // iOS app's is capacitor://localhost, which Stripe rejects). The app
    // passes an explicit https return_url on the public site instead.
    const origins = allowedOrigins(req);
    const origin = origins[0];
    const explicitReturn = safeRedirect(origins, body.return_url, '');

    let accountId: string | null = user.stripe_account_id;

    // Per-currency earned/withdrawn balances for the signed-in user.
    async function computeBalances() {
      const balances: Record<string, { earned: number; withdrawn: number; role: string }> = {};
      const { data: hostEvents } = await svc.from('events')
        .select('id, currency').eq('host_id', user.id);
      const eventCurrency: Record<string, string> = {};
      for (const ev of hostEvents ?? []) {
        eventCurrency[ev.id] = String(ev.currency || 'gbp').toLowerCase();
      }
      const eventIds = (hostEvents ?? []).map((e) => e.id);
      if (eventIds.length) {
        // Only platform-held (legacy, pre-auto-payout) orders count as owed
        // here — orders with a payout_destination were paid to the host's
        // connected account inside the charge itself.
        const { data: orders } = await svc.from('ticket_orders')
          .select('event_id, host_net_minor').in('event_id', eventIds).eq('status', 'paid')
          .is('payout_destination', null);
        for (const o of orders ?? []) {
          const cur = eventCurrency[o.event_id];
          if (!balances[cur]) balances[cur] = { earned: 0, withdrawn: 0, role: 'host' };
          balances[cur].earned += Number(o.host_net_minor || 0);
        }
      }
      const { data: proms } = await svc.from('promoters')
        .select('commission_owed_minor, events(currency)')
        .or(`email.eq.${user.email},user_id.eq.${user.id}`);
      for (const p of proms ?? []) {
        // deno-lint-ignore no-explicit-any
        const cur = String((p as any).events?.currency || 'gbp').toLowerCase();
        const key = `promoter:${cur}`;
        if (!balances[key]) balances[key] = { earned: 0, withdrawn: 0, role: 'promoter' };
        balances[key].earned += Number(p.commission_owed_minor || 0);
      }
      const { data: payouts } = await svc.from('payouts')
        .select('*').eq('user_id', user.id).eq('status', 'paid');
      for (const py of payouts ?? []) {
        const cur = String(py.currency || 'gbp').toLowerCase();
        const key = py.role === 'promoter' ? `promoter:${cur}` : cur;
        if (!balances[key]) balances[key] = { earned: 0, withdrawn: 0, role: py.role || 'host' };
        balances[key].withdrawn += Number(py.amount_minor || 0);
      }
      return Object.entries(balances).map(([key, b]) => ({
        key,
        role: b.role,
        currency: key.includes(':') ? key.split(':')[1] : key,
        earned: toMajor(b.earned),
        withdrawn: toMajor(b.withdrawn),
        available: toMajor(Math.max(0, b.earned - b.withdrawn)),
      }));
    }

    async function setProfileStripe(fields: Record<string, string>) {
      await svc.from('profiles').update(fields).eq('id', user.id);
    }

    // Find-or-create an express account for an email, reusing existing accounts
    // (Stripe blocks NEW account creation until the platform profile review is
    // done, but existing accounts remain usable).
    async function findOrCreateAccount(email: string, metadata: Record<string, string>, country: string) {
      let acct = null;
      try {
        const list = await stripeApi('/accounts?limit=100');
        // deno-lint-ignore no-explicit-any
        acct = (list.data || []).find((a: any) => a.email === email) || null;
      } catch (e) {
        console.error('stripeConnect account lookup failed:', e instanceof Error ? e.message : e);
      }
      if (!acct) {
        try {
          acct = await stripeApi('/accounts', {
            method: 'POST',
            body: formEncode({
              type: 'express',
              email,
              country,
              // Both capabilities: Stripe auto-approves this pair, while
              // transfers-only platforms need manual approval from support.
              'capabilities[card_payments][requested]': 'true',
              'capabilities[transfers][requested]': 'true',
              ...Object.fromEntries(Object.entries(metadata).map(([k, v]) => [`metadata[${k}]`, v])),
            }),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/signed up for Connect/i.test(msg)) {
            throw Object.assign(new Error(
              "Connect isn't enabled on this Stripe account yet. The account owner must sign up for Connect once at https://dashboard.stripe.com/connect, then try again.",
            ), { code: 'needs_connect_signup' });
          }
          if (/responsibilities of managing losses|platform.profile/i.test(msg)) {
            throw Object.assign(new Error(
              'Stripe needs the platform owner to complete the Connect platform profile first. Open https://dashboard.stripe.com/settings/connect/platform-profile, answer the "responsibilities of managing losses" questionnaire, then try again.',
            ), { code: 'needs_platform_profile' });
          }
          throw e;
        }
      }
      return acct;
    }

    async function accountLink(acctId: string, returnPath: string, dashboardIfEnabled = true) {
      let acctInfo = null;
      try {
        acctInfo = await stripeApi(`/accounts/${acctId}`);
      } catch (e) {
        console.error('acct fetch failed', e instanceof Error ? e.message : e);
      }
      const fullyEnabled = acctInfo && acctInfo.charges_enabled && acctInfo.payouts_enabled;
      const returnUrl = explicitReturn || `${origin}${returnPath}`;
      try {
        const link = await stripeApi('/account_links', {
          method: 'POST',
          body: formEncode({
            account: acctId,
            refresh_url: returnUrl,
            return_url: returnUrl,
            type: dashboardIfEnabled && fullyEnabled ? 'account_dashboard' : 'account_onboarding',
          }),
        });
        return link.url as string;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Stripe-managed account: Account Links unavailable — plain dashboard.
        if (/responsible for collecting onboarding|account ID needs to be/i.test(msg)) {
          return 'https://dashboard.stripe.com/';
        }
        throw e;
      }
    }

    if (action === 'onboard') {
      if (!accountId) {
        try {
          const acct = await findOrCreateAccount(user.email, { user_id: user.id },
            resolveCountry(body.country, user.phone));
          accountId = acct.id;
          const status = acct.charges_enabled && acct.payouts_enabled ? 'active' : 'pending';
          await setProfileStripe({
            stripe_account_id: accountId!, stripe_onboarding_status: status, ...accountFacts(acct),
          });
        } catch (e) {
          // deno-lint-ignore no-explicit-any
          const err = e as any;
          if (err.code) return json({ error: err.message, [err.code]: true }, 400);
          throw e;
        }
      }
      return json({ url: await accountLink(accountId!, '/profile') });
    }

    if (action === 'dashboard_link') {
      if (!accountId) return json({ error: 'No Stripe account connected' }, 400);
      return json({ url: await accountLink(accountId, '/profile') });
    }

    if (action === 'status') {
      let account = null;
      if (accountId) {
        try {
          const acct = await stripeApi(`/accounts/${accountId}`);
          account = {
            id: acct.id,
            charges_enabled: acct.charges_enabled,
            payouts_enabled: acct.payouts_enabled,
            details_submitted: acct.details_submitted,
            requirements: acct.requirements?.currently_due || [],
            ...accountFacts(acct),
          };
          const status = acct.charges_enabled && acct.payouts_enabled
            ? 'active'
            : (acct.details_submitted ? 'restricted' : 'pending');
          const facts = accountFacts(acct);
          if (user.stripe_onboarding_status !== status ||
              user.stripe_account_country !== facts.stripe_account_country ||
              user.stripe_default_currency !== facts.stripe_default_currency) {
            await setProfileStripe({ stripe_onboarding_status: status, ...facts });
          }
        } catch (e) {
          account = { error: e instanceof Error ? e.message : String(e) };
        }
      }
      return json({ account, balances: await computeBalances() });
    }

    // ---- Business accounts (payouts to owner's personal or separate account) ----
    // A business is manageable by its owner OR any accepted member (members have
    // full owner-parity access, including payouts).
    async function loadOwnedBusiness(businessId: string | undefined) {
      if (!businessId) return null;
      const { data: b } = await svc.from('business_accounts')
        .select('*').eq('id', businessId).single();
      if (!b) return null;
      if (b.owner_id === user.id) return b;
      const { data: m } = await svc.from('business_members')
        .select('id').eq('business_id', businessId).eq('status', 'accepted')
        .or(`user_id.eq.${user.id},email.eq.${user.email}`).maybeSingle();
      return m ? b : null;
    }

    async function accountStatus(acctId: string | null) {
      if (!acctId) return null;
      try {
        const acct = await stripeApi(`/accounts/${acctId}`);
        return {
          id: acct.id,
          charges_enabled: acct.charges_enabled,
          payouts_enabled: acct.payouts_enabled,
          details_submitted: acct.details_submitted,
          ...accountFacts(acct),
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }

    async function computeBusinessBalances(businessId: string) {
      const balances: Record<string, number> = {};
      const { data: events } = await svc.from('events')
        .select('id, currency').eq('business_id', businessId);
      const ids = (events ?? []).map((e) => e.id);
      if (ids.length) {
        const { data: orders } = await svc.from('ticket_orders')
          .select('event_id, host_net_minor').in('event_id', ids).eq('status', 'paid')
          .is('payout_destination', null);
        const curOf = Object.fromEntries(
          (events ?? []).map((e) => [e.id, String(e.currency || 'gbp').toLowerCase()]),
        );
        for (const o of orders ?? []) {
          const cur = curOf[o.event_id];
          balances[cur] = (balances[cur] || 0) + Number(o.host_net_minor || 0);
        }
      }
      return Object.entries(balances).map(([cur, earned]) => ({
        key: cur, role: 'host', currency: cur,
        earned: toMajor(earned), withdrawn: 0, available: toMajor(earned),
      }));
    }

    const businessMode = (b: { stripe_mode: string }) =>
      b.stripe_mode === 'personal' ? 'personal' : 'business';

    if (action === 'business_set_mode') {
      const business = await loadOwnedBusiness(body.business_id);
      if (!business) return json({ error: 'Business account not found' }, 403);
      const mode = body.mode === 'personal' ? 'personal' : 'business';
      await svc.from('business_accounts').update({ stripe_mode: mode }).eq('id', business.id);
      return json({ ok: true, mode });
    }

    if (action === 'business_status') {
      const business = await loadOwnedBusiness(body.business_id);
      if (!business) return json({ error: 'Business account not found' }, 403);
      const mode = businessMode(business);
      const acctId = mode === 'personal' ? user.stripe_account_id : business.stripe_account_id;
      const account = await accountStatus(acctId);
      if (account && !('error' in account)) {
        const status = account.charges_enabled && account.payouts_enabled
          ? 'active' : (account.details_submitted ? 'restricted' : 'pending');
        const facts = {
          stripe_account_country: account.stripe_account_country,
          stripe_default_currency: account.stripe_default_currency,
        };
        const row = mode === 'business' ? business : user;
        if (row.stripe_onboarding_status !== status ||
            row.stripe_account_country !== facts.stripe_account_country ||
            row.stripe_default_currency !== facts.stripe_default_currency) {
          if (mode === 'business') {
            await svc.from('business_accounts')
              .update({ stripe_onboarding_status: status, ...facts }).eq('id', business.id);
          } else {
            await setProfileStripe({ stripe_onboarding_status: status, ...facts });
          }
        }
      }
      return json({ mode, account, balances: await computeBusinessBalances(business.id) });
    }

    if (action === 'business_onboard') {
      const business = await loadOwnedBusiness(body.business_id);
      if (!business) return json({ error: 'Business account not found' }, 403);
      const mode = businessMode(business);
      try {
        if (mode === 'personal') {
          let personalId = user.stripe_account_id;
          if (!personalId) {
            const acct = await findOrCreateAccount(user.email, { user_id: user.id },
              resolveCountry(body.country, user.phone));
            personalId = acct.id;
            const status = acct.charges_enabled && acct.payouts_enabled ? 'active' : 'pending';
            await setProfileStripe({
              stripe_account_id: personalId, stripe_onboarding_status: status, ...accountFacts(acct),
            });
          }
          return json({ url: await accountLink(personalId, '/business/create-event') });
        }
        let bizId = business.stripe_account_id;
        if (!bizId) {
          const acct = await findOrCreateAccount(business.business_email, { business_id: business.id },
            resolveCountry(body.country, user.phone));
          bizId = acct.id;
          const status = acct.charges_enabled && acct.payouts_enabled ? 'active' : 'pending';
          await svc.from('business_accounts')
            .update({ stripe_account_id: bizId, stripe_onboarding_status: status, ...accountFacts(acct) })
            .eq('id', business.id);
        }
        return json({ url: await accountLink(bizId, '/business/create-event') });
      } catch (e) {
        // deno-lint-ignore no-explicit-any
        const err = e as any;
        if (err.code) return json({ error: err.message, [err.code]: true }, 400);
        throw e;
      }
    }

    if (action === 'business_dashboard_link') {
      const business = await loadOwnedBusiness(body.business_id);
      if (!business) return json({ error: 'Business account not found' }, 403);
      const mode = businessMode(business);
      const acctId = mode === 'personal' ? user.stripe_account_id : business.stripe_account_id;
      if (!acctId) return json({ error: 'No Stripe account connected' }, 400);
      return json({ url: await accountLink(acctId, '/business/create-event') });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('stripeConnect error:', error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
