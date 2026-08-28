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
}

export async function resolvePayoutAccount(svc: any, event: any): Promise<PayoutAccount> {
  if (event.business_id) {
    const { data: business } = await svc.from('business_accounts')
      .select('owner_id, stripe_mode, stripe_account_id, stripe_onboarding_status')
      .eq('id', event.business_id).maybeSingle();
    if (!business) return { accountId: null, active: false };
    if (business.stripe_mode !== 'personal') {
      return {
        accountId: business.stripe_account_id ?? null,
        active: business.stripe_onboarding_status === 'active' && !!business.stripe_account_id,
      };
    }
    const { data: owner } = await svc.from('profiles')
      .select('stripe_account_id, stripe_onboarding_status')
      .eq('id', business.owner_id).maybeSingle();
    return {
      accountId: owner?.stripe_account_id ?? null,
      active: owner?.stripe_onboarding_status === 'active' && !!owner?.stripe_account_id,
    };
  }
  const { data: host } = await svc.from('profiles')
    .select('stripe_account_id, stripe_onboarding_status')
    .eq('id', event.host_id).maybeSingle();
  return {
    accountId: host?.stripe_account_id ?? null,
    active: host?.stripe_onboarding_status === 'active' && !!host?.stripe_account_id,
  };
}

export const PAYOUT_SETUP_ERROR =
  "The host hasn't finished payment setup for this event yet.";
