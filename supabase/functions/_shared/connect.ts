// Payout-account resolution for automatic host payouts. Mirrors the routing
// rules of the stripeConnect function: an event owned by a business account
// pays out to the business's own Stripe account (stripe_mode 'business') or to
// its owner's personal account (stripe_mode 'personal'); a personal event pays
// out to the host's account. `active` reflects the stored onboarding status,
// which the Stripe panel's status action refreshes from Stripe on every load.
// deno-lint-ignore-file no-explicit-any

export interface PayoutAccount {
  accountId: string | null;
  active: boolean;
  // ISO-3166 country of the connected account as last seen from Stripe (null
  // for accounts created before it was recorded — treated as the platform's).
  country: string | null;
}

export async function resolvePayoutAccount(svc: any, event: any): Promise<PayoutAccount> {
  if (event.business_id) {
    const { data: business } = await svc.from('business_accounts')
      .select('owner_id, stripe_mode, stripe_account_id, stripe_onboarding_status, stripe_account_country')
      .eq('id', event.business_id).maybeSingle();
    if (!business) return { accountId: null, active: false, country: null };
    if (business.stripe_mode !== 'personal') return fromRow(business);
    const { data: owner } = await svc.from('profiles')
      .select('stripe_account_id, stripe_onboarding_status, stripe_account_country')
      .eq('id', business.owner_id).maybeSingle();
    return fromRow(owner);
  }
  const { data: host } = await svc.from('profiles')
    .select('stripe_account_id, stripe_onboarding_status, stripe_account_country')
    .eq('id', event.host_id).maybeSingle();
  return fromRow(host);
}

// deno-lint-ignore no-explicit-any
function fromRow(row: any): PayoutAccount {
  return {
    accountId: row?.stripe_account_id ?? null,
    active: row?.stripe_onboarding_status === 'active' && !!row?.stripe_account_id,
    country: row?.stripe_account_country ? String(row.stripe_account_country).toUpperCase() : null,
  };
}

export const PAYOUT_SETUP_ERROR =
  "The host hasn't finished payment setup for this event yet.";
