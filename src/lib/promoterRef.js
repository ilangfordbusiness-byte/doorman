import { base44 } from "@/api/base44Client";

const DOMAIN_KEY = "doorman_link_domain";

// The canonical live domain for shareable links. All promoter tracking links,
// event share links, ticket-sale QR codes, and checkout redirects use this so
// they resolve to the real app regardless of where the code is running (preview
// sandbox, staging, etc.). Hosts can still override it from the Promoter panel.
const DEFAULT_LINK_DOMAIN = "https://thedoorman.app";

export function getLinkDomain() {
  try {
    const stored = localStorage.getItem(DOMAIN_KEY);
    if (stored) return stored;
  } catch {}
  return DEFAULT_LINK_DOMAIN;
}

export function setLinkDomain(raw) {
  let v = String(raw || "").trim();
  if (v && !/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    if (!v) {
      localStorage.removeItem(DOMAIN_KEY);
      return DEFAULT_LINK_DOMAIN;
    }
    const origin = new URL(v).origin;
    localStorage.setItem(DOMAIN_KEY, origin);
    return origin;
  } catch {
    return DEFAULT_LINK_DOMAIN;
  }
}

export function getStoredRef(eventId) {
  try {
    return localStorage.getItem(`promoter_ref_${eventId}`);
  } catch {
    return null;
  }
}

// Validate a ref code for an event via the backend (service role) so guests can
// resolve public promoter links without RLS access to the Promoter table. Persists
// the ref for checkout attribution and counts a click once per browser session.
// Returns { valid, promoter } where promoter carries the public discount config.
export async function captureRef(eventId, code) {
  if (!eventId || !code) return { valid: false };
  try {
    const clickKey = `doorman_click_${eventId}_${code}`;
    const countClick = !sessionStorage.getItem(clickKey);
    if (countClick) sessionStorage.setItem(clickKey, "1");
    const res = await base44.functions.invoke("resolvePromoterRef", {
      event_id: eventId,
      code: String(code).trim(),
      count_click: countClick,
    });
    const d = res.data;
    if (!d || !d.valid) return { valid: false };
    localStorage.setItem(`promoter_ref_${eventId}`, d.promoter.tracking_code);
    return { valid: true, promoter: d.promoter };
  } catch {
    return { valid: false };
  }
}

// Fetch the public promoter record (with discount config) for a stored ref,
// without counting a click. Used by the checkout page to show the auto-applied
// discount. Returns the promoter object or null.
export async function getPromoterByCode(eventId, code) {
  if (!eventId || !code) return null;
  try {
    const res = await base44.functions.invoke("resolvePromoterRef", {
      event_id: eventId,
      code: String(code).trim(),
      count_click: false,
    });
    return res.data?.valid ? res.data.promoter : null;
  } catch {
    return null;
  }
}

export const MIN_PAID = 0.5;

// Whether the promoter's auto-discount is currently available (configured and
// not exhausted). max_uses = 0 means unlimited.
export function promoterDiscountActive(promoter) {
  if (!promoter) return false;
  const type = promoter.discount_type;
  if (!type || type === "none" || Number(promoter.discount_value || 0) <= 0) return false;
  const max = Number(promoter.discount_max_uses || 0);
  if (max === 0) return true;
  return Number(promoter.discount_used_count || 0) < max;
}

// Compute the promoter discount for a ticket price (major units), flooring the
// paid amount at the platform minimum. Mirrors the server-side logic.
export function computePromoterDiscount(price, promoter) {
  if (!promoter) return { discount: 0, paid: price };
  const type = promoter.discount_type;
  const value = Number(promoter.discount_value || 0);
  if (!type || type === "none" || value <= 0) return { discount: 0, paid: price };
  let discount = type === "percent" ? price * (value / 100) : value;
  let paid = price - discount;
  if (paid < MIN_PAID) paid = MIN_PAID;
  if (paid > price) paid = price;
  discount = price - paid;
  if (discount < 0) discount = 0;
  return { discount, paid };
}

// Human-readable discount label, e.g. "10% off" or "£5.00 off". Null if none.
export function discountLabel(promoter, sym = "") {
  if (!promoter || !promoter.discount_type || promoter.discount_type === "none") return null;
  const v = Number(promoter.discount_value || 0);
  if (v <= 0) return null;
  return promoter.discount_type === "percent"
    ? `${v}% off`
    : `${sym}${v.toFixed(2)} off`;
}

// Remaining discounted uses, or null when unlimited / no discount configured.
export function usesRemaining(promoter) {
  if (!promoter) return null;
  const max = Number(promoter.discount_max_uses || 0);
  if (max === 0) return null;
  return Math.max(0, max - Number(promoter.discount_used_count || 0));
}