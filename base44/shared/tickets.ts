// Shared ticket pricing helpers used by createTicketCheckout and ticketWebhook.
// Platform fee: fixed 0.50 + 4% of the discounted amount the guest actually pays.

export const PLATFORM_FEE_FIXED_MINOR = 50; // 0.50 in the currency's minor units
export const PLATFORM_FEE_PERCENT = 0.04; // 4%
export const MIN_PAID_MINOR = 50; // minimum chargeable amount (platform minimum fee floor)

export function toMinor(amount) {
  return Math.round(Number(amount) * 100);
}

export function toMajor(minor) {
  return Number(minor) / 100;
}

export function computeFeeMinor(paidMinor) {
  return PLATFORM_FEE_FIXED_MINOR + Math.round(PLATFORM_FEE_PERCENT * paidMinor);
}

// Apply a percentage discount and floor the result at the platform minimum.
export function applyDiscount(unitMinor, discountPercent) {
  const discount = Math.round(unitMinor * (Number(discountPercent) / 100));
  let paid = unitMinor - discount;
  if (paid < 0) paid = 0;
  if (paid < MIN_PAID_MINOR) paid = MIN_PAID_MINOR;
  return { discount, paid };
}

export function currencySymbol(code) {
  const map = { gbp: "£", eur: "€", usd: "$" };
  return map[String(code).toLowerCase()] || "";
}

export function formatMoney(minor, code) {
  return currencySymbol(code) + toMajor(minor).toFixed(2);
}