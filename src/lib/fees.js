// Client mirror of the platform fee (supabase/functions/_shared/tickets.ts):
// 45p + 4% per ticket, computed on the post-discount price in minor units.
// Used to show the booking fee that is added at checkout when an event passes
// the fee to buyers (events.fee_mode === 'pass_on') — the server recomputes
// independently. Tickets are shown at the host's face price while browsing.
export const FEE_FIXED_MINOR = 45;
export const FEE_PERCENT = 0.04;

export function bookingFeeMinor(priceMinor) {
  return FEE_FIXED_MINOR + Math.round(FEE_PERCENT * priceMinor);
}

// Major units in, major units out (mirrors the server's minor-unit rounding).
export function bookingFee(price) {
  return bookingFeeMinor(Math.round(Number(price) * 100)) / 100;
}

// The price a buyer actually pays for a ticket priced `price`, given the
// event's fee mode. Under 'absorb' (and for free tickets) it is unchanged.
export function buyerPrice(price, feeMode) {
  const p = Number(price) || 0;
  if (feeMode !== "pass_on" || p <= 0) return p;
  return p + bookingFee(p);
}
