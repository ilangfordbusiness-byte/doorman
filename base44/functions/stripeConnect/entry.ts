import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const STRIPE_VERSION = '2025-10-29.clover';

async function stripeApi(path, opts = {}) {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('Stripe is not configured');
  const url = `https://api.stripe.com/v1${path}`;
  const headers = {
    Authorization: `Bearer ${key}`,
    'Stripe-Version': STRIPE_VERSION,
  };
  if (opts.body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  const res = await fetch(url, { method: opts.method || 'GET', headers, body: opts.body });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `Stripe error ${res.status}`);
  return json;
}

function formEncode(obj) {
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    parts.push(`${k}=${encodeURIComponent(v)}`);
  }
  return parts.join('&');
}

const ZERO_DECIMAL = new Set(['jpy', 'krw', 'vnd', 'idr', 'clp', 'pyg', 'ugx', 'rwf', 'bif']);
function toMinor(amount, currency) {
  return ZERO_DECIMAL.has(currency) ? Math.round(amount) : Math.round(amount * 100);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { action } = body;
    const srv = base44.asServiceRole;
    const appId = Deno.env.get('BASE44_APP_ID');
    const origin = req.headers.get('origin') || 'https://doorman-app.base44.app';

    let accountId = user.stripe_account_id;

    // Build per-currency earnings + withdrawn balances for the signed-in user.
    async function computeBalances() {
      const balances = {};
      const eventCurrency = {};
      const hostEvents = await srv.entities.Event.filter({ host_email: user.email });
      for (const ev of hostEvents) {
        eventCurrency[ev.id] = String(ev.currency || 'gbp').toLowerCase();
      }
      // Host earnings from paid orders
      for (const ev of hostEvents) {
        const cur = eventCurrency[ev.id];
        const ords = await srv.entities.TicketOrder.filter({ event_id: ev.id, status: 'paid' });
        for (const o of ords) {
          if (!balances[cur]) balances[cur] = { earned: 0, withdrawn: 0, role: 'host' };
          balances[cur].earned += Number(o.host_net || 0);
        }
      }
      // Promoter earnings
      const proms = await srv.entities.Promoter.filter({ email: user.email });
      for (const p of proms) {
        let cur = eventCurrency[p.event_id];
        if (!cur) {
          const ev = await srv.entities.Event.get(p.event_id).catch(() => null);
          cur = String(ev?.currency || 'gbp').toLowerCase();
          if (ev) eventCurrency[p.event_id] = cur;
        }
        const key = `promoter:${cur}`;
        if (!balances[key]) balances[key] = { earned: 0, withdrawn: 0, role: 'promoter' };
        balances[key].earned += Number(p.commission_owed || 0);
      }
      // Subtract already-paid payouts
      const payouts = await srv.entities.Payout.filter({ user_email: user.email, status: 'paid' });
      for (const py of payouts) {
        const cur = String(py.currency || 'gbp').toLowerCase();
        const key = py.role === 'promoter' ? `promoter:${cur}` : cur;
        if (!balances[key]) balances[key] = { earned: 0, withdrawn: 0, role: py.role || 'host' };
        balances[key].withdrawn += Number(py.amount || 0);
      }
      const out = [];
      for (const [key, b] of Object.entries(balances)) {
        const currency = key.includes(':') ? key.split(':')[1] : key;
        out.push({
          key,
          role: b.role,
          currency,
          earned: Number(b.earned.toFixed(2)),
          withdrawn: Number(b.withdrawn.toFixed(2)),
          available: Number(Math.max(0, b.earned - b.withdrawn).toFixed(2)),
        });
      }
      return out;
    }

    if (action === 'onboard') {
      if (!accountId) {
        // Reuse an existing connected account with the same email instead of
        // creating a duplicate. Stripe blocks NEW account creation until the
        // platform-profile "responsibilities of managing losses" review is done,
        // but accounts that already exist remain fully usable — so linking the
        // existing one lets the host onboard without that manual review.
        let acct = null;
        try {
          const list = await stripeApi('/accounts?limit=100');
          acct = (list.data || []).find((a) => a.email === user.email) || null;
        } catch (e) {
          console.error('stripeConnect account lookup failed:', e.message);
        }
        if (!acct) {
          try {
            acct = await stripeApi('/accounts', {
              method: 'POST',
              body: formEncode({
                type: 'express',
                email: user.email,
                'metadata[base44_app_id]': appId,
                'metadata[user_id]': user.id,
                'capabilities[transfers][requested]': 'true',
              }),
            });
          } catch (e) {
            if (/signed up for Connect/i.test(e.message)) {
              return Response.json({
                error: 'Connect isn\'t enabled on this Stripe account yet. The account owner must sign up for Connect once at https://dashboard.stripe.com/connect, then try again.',
                needs_connect_signup: true,
              }, { status: 400 });
            }
            if (/responsibilities of managing losses|platform-profile|platform profile|complete your platform profile/i.test(e.message)) {
              return Response.json({
                error: 'Stripe needs the platform owner to complete the Connect platform profile first. Open https://dashboard.stripe.com/settings/connect/platform-profile, answer the "responsibilities of managing losses" questionnaire, then try again.',
                needs_platform_profile: true,
              }, { status: 400 });
            }
            throw e;
          }
        }
        accountId = acct.id;
        const status = acct.charges_enabled && acct.payouts_enabled ? 'active' : 'pending';
        await base44.auth.updateMe({ stripe_account_id: accountId, stripe_onboarding_status: status });
      }
      // If the linked account is already fully enabled, send the user to their
      // Stripe dashboard rather than re-running onboarding.
      let acctInfo = null;
      try { acctInfo = await stripeApi(`/accounts/${accountId}`); } catch (e) { console.error('acct fetch failed', e.message); }
      const fullyEnabled = acctInfo && acctInfo.charges_enabled && acctInfo.payouts_enabled;
      try {
        const link = await stripeApi('/account_links', {
          method: 'POST',
          body: formEncode({
            account: accountId,
            refresh_url: `${origin}/profile`,
            return_url: `${origin}/profile`,
            type: fullyEnabled ? 'account_dashboard' : 'account_onboarding',
          }),
        });
        return Response.json({ url: link.url });
      } catch (e) {
        if (/responsible for collecting onboarding|account ID needs to be/i.test(e.message)) {
          return Response.json({ url: 'https://dashboard.stripe.com/' });
        }
        throw e;
      }
    }

    if (action === 'dashboard_link') {
      if (!accountId) return Response.json({ error: 'No Stripe account connected' }, { status: 400 });
      try {
        const link = await stripeApi('/account_links', {
          method: 'POST',
          body: formEncode({
            account: accountId,
            refresh_url: `${origin}/profile`,
            return_url: `${origin}/profile`,
            type: 'account_dashboard',
          }),
        });
        return Response.json({ url: link.url });
      } catch (e) {
        // The linked account is Stripe-managed (Stripe collects requirements,
        // not this platform), so Account Links aren't available for it. Send
        // the user straight to the Stripe dashboard instead.
        if (/responsible for collecting onboarding|account ID needs to be/i.test(e.message)) {
          return Response.json({ url: 'https://dashboard.stripe.com/' });
        }
        throw e;
      }
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
          };
          const status = acct.charges_enabled && acct.payouts_enabled
            ? 'active'
            : (acct.details_submitted ? 'restricted' : 'pending');
          if (user.stripe_onboarding_status !== status) {
            await base44.auth.updateMe({ stripe_onboarding_status: status });
          }
        } catch (e) {
          account = { error: e.message };
        }
      }
      const balances = await computeBalances();
      return Response.json({ account, balances });
    }

    // ---- Business account Stripe (separate account per business) ----
    async function loadOwnedBusiness(businessId) {
      if (!businessId) return null;
      const list = await srv.entities.BusinessAccount.filter({ id: businessId });
      if (!list.length) return null;
      const b = list[0];
      if (b.owner_email !== user.email) return null;
      return b;
    }

    async function computeBusinessBalances(businessId) {
      const balances = {};
      const events = await srv.entities.Event.filter({ business_id: businessId });
      for (const ev of events) {
        const cur = String(ev.currency || 'gbp').toLowerCase();
        if (!balances[cur]) balances[cur] = { earned: 0 };
        const ords = await srv.entities.TicketOrder.filter({ event_id: ev.id, status: 'paid' });
        for (const o of ords) balances[cur].earned += Number(o.host_net || 0);
      }
      return Object.entries(balances).map(([cur, b]) => ({
        key: cur, role: 'host', currency: cur,
        earned: Number(b.earned.toFixed(2)),
        withdrawn: 0,
        available: Number(b.earned.toFixed(2)),
      }));
    }

    if (action === 'business_onboard') {
      const business = await loadOwnedBusiness(body.business_id);
      if (!business) return Response.json({ error: 'Business account not found' }, { status: 403 });
      let accountId = business.stripe_account_id;
      if (!accountId) {
        let acct = null;
        try {
          const list = await stripeApi('/accounts?limit=100');
          acct = (list.data || []).find((a) => a.email === business.business_email) || null;
        } catch (e) {
          console.error('business account lookup failed:', e.message);
        }
        if (!acct) {
          try {
            acct = await stripeApi('/accounts', {
              method: 'POST',
              body: formEncode({
                type: 'express',
                email: business.business_email,
                'metadata[base44_app_id]': appId,
                'metadata[business_id]': business.id,
                'capabilities[transfers][requested]': 'true',
              }),
            });
          } catch (e) {
            if (/signed up for Connect/i.test(e.message)) {
              return Response.json({ error: 'Connect isn\'t enabled on this Stripe account yet. The account owner must sign up for Connect once at https://dashboard.stripe.com/connect, then try again.', needs_connect_signup: true }, { status: 400 });
            }
            throw e;
          }
        }
        accountId = acct.id;
        const status = acct.charges_enabled && acct.payouts_enabled ? 'active' : 'pending';
        await srv.entities.BusinessAccount.update(business.id, { stripe_account_id: accountId, stripe_onboarding_status: status });
      }
      let acctInfo = null;
      try { acctInfo = await stripeApi(`/accounts/${accountId}`); } catch (e) { console.error('biz acct fetch failed', e.message); }
      const fullyEnabled = acctInfo && acctInfo.charges_enabled && acctInfo.payouts_enabled;
      try {
        const link = await stripeApi('/account_links', {
          method: 'POST',
          body: formEncode({
            account: accountId,
            refresh_url: `${origin}/business/create-event`,
            return_url: `${origin}/business/create-event`,
            type: fullyEnabled ? 'account_dashboard' : 'account_onboarding',
          }),
        });
        return Response.json({ url: link.url });
      } catch (e) {
        if (/responsible for collecting onboarding|account ID needs to be/i.test(e.message)) {
          return Response.json({ url: 'https://dashboard.stripe.com/' });
        }
        throw e;
      }
    }

    if (action === 'business_status') {
      const business = await loadOwnedBusiness(body.business_id);
      if (!business) return Response.json({ error: 'Business account not found' }, { status: 403 });
      let account = null;
      if (business.stripe_account_id) {
        try {
          const acct = await stripeApi(`/accounts/${business.stripe_account_id}`);
          account = { id: acct.id, charges_enabled: acct.charges_enabled, payouts_enabled: acct.payouts_enabled, details_submitted: acct.details_submitted };
          const status = acct.charges_enabled && acct.payouts_enabled ? 'active' : (acct.details_submitted ? 'restricted' : 'pending');
          if (business.stripe_onboarding_status !== status) {
            await srv.entities.BusinessAccount.update(business.id, { stripe_onboarding_status: status });
          }
        } catch (e) { account = { error: e.message }; }
      }
      const balances = await computeBusinessBalances(business.id);
      return Response.json({ account, balances });
    }

    if (action === 'business_dashboard_link') {
      const business = await loadOwnedBusiness(body.business_id);
      if (!business || !business.stripe_account_id) return Response.json({ error: 'No Stripe account connected' }, { status: 400 });
      try {
        const link = await stripeApi('/account_links', {
          method: 'POST',
          body: formEncode({
            account: business.stripe_account_id,
            refresh_url: `${origin}/business/create-event`,
            return_url: `${origin}/business/create-event`,
            type: 'account_dashboard',
          }),
        });
        return Response.json({ url: link.url });
      } catch (e) {
        if (/responsible for collecting onboarding|account ID needs to be/i.test(e.message)) return Response.json({ url: 'https://dashboard.stripe.com/' });
        throw e;
      }
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('stripeConnect error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});