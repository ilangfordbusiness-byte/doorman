// Client mirror of the platform fee (supabase/functions/_shared/tickets.ts):
// a fixed part + 4% per ticket, computed on the post-discount price in minor
// units. The fixed part is per currency: 45p / 45c / 45¢, and 2.00 AED.
// Used to show the booking fee that is added at checkout when an event passes
// the fee to buyers (events.fee_mode === 'pass_on') — the server recomputes
// independently. Tickets are shown at the host's face price while browsing.
const FEE_FIXED_MINOR = { gbp: 45, eur: 45, usd: 45, aed: 200 };
export const FEE_PERCENT = 0.04;

const code = (currency) => String(currency || "gbp").toLowerCase();

export function feeFixedMinor(currency) {
  return FEE_FIXED_MINOR[code(currency)] ?? 45;
}

export function bookingFeeMinor(priceMinor, currency) {
  return feeFixedMinor(currency) + Math.round(FEE_PERCENT * priceMinor);
}

// Major units in, major units out (mirrors the server's minor-unit rounding).
export function bookingFee(price, currency) {
  return bookingFeeMinor(Math.round(Number(price) * 100), currency) / 100;
}

// Lowest price (major units) a discount can bring a ticket down to. Mirrors
// minPaidMinor on the server.
const MIN_PAID_MINOR = { gbp: 50, eur: 50, usd: 50, aed: 200 };
export function minPaid(currency) {
  return (MIN_PAID_MINOR[code(currency)] ?? 50) / 100;
}

// The price a buyer actually pays for a ticket priced `price`, given the
// event's fee mode. Under 'absorb' (and for free tickets) it is unchanged.
export function buyerPrice(price, feeMode, currency) {
  const p = Number(price) || 0;
  if (feeMode !== "pass_on" || p <= 0) return p;
  return p + bookingFee(p, currency);
}

// Stripe's minimum charge per currency, in minor units. Anything else gets the
// highest of these.
const STRIPE_MIN_CHARGE_MINOR = { gbp: 30, usd: 50, eur: 50, aed: 200 };

export function stripeMinChargeMinor(currency) {
  return STRIPE_MIN_CHARGE_MINOR[code(currency)] ?? 50;
}

// The lowest tier price (minor units) a buyer can actually check out at. Under
// 'pass_on' the buyer's charge is price + fee, which only has to reach Stripe's
// minimum. Otherwise the charge is the price alone: it has to reach the minimum
// and leave room for the fee. This only warns the host early; the server
// recomputes independently.
export function minTierPriceMinor(feeMode, currency) {
  const stripeMin = stripeMinChargeMinor(currency);
  const chargeable = (p) => feeMode === "pass_on"
    ? p + bookingFeeMinor(p, currency) >= stripeMin
    : bookingFeeMinor(p, currency) < p && p >= stripeMin;
  let price = 1;
  while (!chargeable(price)) price += 1;
  return price;
}

// Why a tier price typed by the host (major units, raw input value) can't be
// bought, or null when it can. Empty and 0 are not flagged here.
// reason: "fee_larger" | "fee_equal" | "stripe_minimum".
export function tierPriceProblem(price, feeMode, currency) {
  const major = Number(price);
  if (!Number.isFinite(major) || major <= 0) return null;
  const priceMinor = Math.round(major * 100);
  const minMinor = minTierPriceMinor(feeMode, currency);
  if (priceMinor >= minMinor) return null;
  const fee = bookingFeeMinor(priceMinor, currency);
  let reason = "stripe_minimum";
  if (feeMode !== "pass_on" && fee >= priceMinor) reason = fee > priceMinor ? "fee_larger" : "fee_equal";
  return { minMinor, reason };
}
