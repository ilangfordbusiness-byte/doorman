// Ticket pricing + QR + ticket-email helpers, ported from the original app's shared ticket helpers.
// All amounts are integer minor units end to end (the schema stores minor units,
// so the old toMinor/toMajor conversions on stored values are gone).
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { appOrigin, emailFooter, escapeHtml, formatEventDateLong, formatTimeRange, sendEmail } from './email.ts';

// Platform cut per ticket sold: 45p + 4% of the (post-discount) ticket price.
export const PLATFORM_FEE_FIXED_MINOR = 45; // 0.45 in minor units
export const PLATFORM_FEE_PERCENT = 0.04; // 4%
export const MIN_PAID_MINOR = 50; // lowest price a discount can bring a ticket down to

// Stripe's minimum charge, in minor units of the charge currency
// (docs.stripe.com/currencies, "Minimum charge amount by currency").
export const STRIPE_MIN_CHARGE_MINOR: Record<string, number> = { gbp: 30, usd: 50, eur: 50 };
const STRIPE_MIN_CHARGE_FALLBACK_MINOR = 50; // the common value; events only offer the three above

export function toMajor(minor: number): number {
  return Number(minor) / 100;
}

export function computeFeeMinor(paidMinor: number): number {
  return PLATFORM_FEE_FIXED_MINOR + Math.round(PLATFORM_FEE_PERCENT * paidMinor);
}

// The lowest tier price that can actually be sold, per ticket: the charge must
// meet Stripe's minimum and the platform fee must stay below the charge, or
// Stripe rejects the application fee. 'absorb' charges the price itself;
// 'pass_on' adds the fee on top, so its charge is price + fee. Results today:
// absorb 48 GBP, 50 USD/EUR; pass_on 1 GBP, 5 USD/EUR. Any other fee_mode is
// treated as absorb, the same way createTicketCheckout reads it.
export function minTierPriceMinor(feeMode: unknown, currency: unknown): number {
  const code = String(currency || 'gbp').toLowerCase();
  const stripeMin = STRIPE_MIN_CHARGE_MINOR[code] ?? STRIPE_MIN_CHARGE_FALLBACK_MINOR;
  for (let price = 1; ; price++) {
    const fee = computeFeeMinor(price);
    const charge = feeMode === 'pass_on' ? price + fee : price;
    if (fee < charge && charge >= stripeMin) return price;
  }
}

// Fits the per-ticket discounts under the floor, trimming the promo portion
// first (the promoter discount is the primary, auto-applied one). The floor is
// MIN_PAID_MINOR, which the app also quotes (lib/promoterRef.js), or the tier
// minimum if that is ever higher. A tier already at or below the floor gets no
// discount, so `paid` can never drop under minTierPriceMinor for a sellable tier.
export function capDiscountsMinor(
  unitMinor: number, promoterDiscountMinor: number, promoDiscountMinor: number,
  feeMode: unknown, currency: unknown,
) {
  const floor = Math.max(MIN_PAID_MINOR, minTierPriceMinor(feeMode, currency));
  const cap = Math.max(0, unitMinor - floor);
  const promoter = Math.min(promoterDiscountMinor, cap);
  const promo = Math.min(promoDiscountMinor, cap - promoter);
  return { promoter, promo, total: promoter + promo };
}

// Commission comes out of the host's net: never negative, never more than the net.
export function clampCommissionMinor(commissionMinor: number, hostNetMinor: number): number {
  return Math.max(0, Math.min(commissionMinor, hostNetMinor));
}

// deno-lint-ignore no-explicit-any
export function promoterDiscountAvailable(promoter: any): boolean {
  if (!promoter) return false;
  const type = promoter.discount_type;
  if (!type || type === 'none') return false;
  const value = type === 'percent'
    ? Number(promoter.discount_percent || 0)
    : Number(promoter.discount_flat_minor || 0);
  if (value <= 0) return false;
  const maxUses = Number(promoter.discount_max_uses || 0);
  if (maxUses === 0) return true;
  return Number(promoter.discount_used_count || 0) < maxUses;
}

// deno-lint-ignore no-explicit-any
export function computePromoterDiscountMinor(unitMinor: number, promoter: any): number {
  if (!promoter) return 0;
  if (promoter.discount_type === 'percent') {
    const pct = Number(promoter.discount_percent || 0);
    if (pct <= 0) return 0;
    return Math.min(unitMinor, Math.round(unitMinor * (pct / 100)));
  }
  if (promoter.discount_type === 'flat') {
    return Math.min(unitMinor, Number(promoter.discount_flat_minor || 0));
  }
  return 0;
}

export function applyDiscount(unitMinor: number, discountPercent: number) {
  const discount = Math.round(unitMinor * (Number(discountPercent) / 100));
  let paid = unitMinor - discount;
  if (paid < 0) paid = 0;
  if (paid < MIN_PAID_MINOR) paid = MIN_PAID_MINOR;
  return { discount, paid };
}

export function currencySymbol(code: string): string {
  const map: Record<string, string> = { gbp: '£', eur: '€', usd: '$' };
  return map[String(code).toLowerCase()] || '';
}

export function formatMoney(minor: number, code: string): string {
  return currencySymbol(code) + toMajor(minor).toFixed(2);
}

// --- Static single-use QR + ticket email (unchanged wire format) ---

// deno-lint-ignore no-explicit-any
export function buildQrPayload(entry: any): string {
  return btoa(JSON.stringify({ eid: entry.event_id, gid: entry.id, sec: entry.qr_secret }));
}

// deno-lint-ignore no-explicit-any
export function buildQrImageUrl(entry: any): string {
  const payload = buildQrPayload(entry);
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payload)}&bgcolor=FFFFFF&color=000000`;
}

// --- Live (rotating) QR codes, for events with live_qr on ---
//
// The displayed code changes every LIVE_QR_PERIOD_MS. Each code is an HMAC
// signature over the window counter, keyed by the entry's qr_secret, so it
// can only be minted by the server and only verified by validateQR (which can
// read qr_secret). The door accepts a presented window within ±LIVE_QR_TOL
// windows of its own clock, which both tolerates clock skew between the two
// phones and bounds how long a screenshot stays valid (~LIVE_QR_TOL periods).

export const LIVE_QR_PERIOD_MS = 10_000;        // code rotates every 10s
export const LIVE_QR_TOL = 6;                   // accept ±6 windows (~±60s) of skew
export const LIVE_QR_VERSION = 2;

export function liveQrWindow(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / LIVE_QR_PERIOD_MS);
}

// Hex HMAC-SHA256(qr_secret, "v2.<eid>.<gid>.<window>"). Shared by the minting
// function and the door so the two never drift. Returns lowercase hex.
export async function liveQrSig(
  qrSecret: string,
  eid: string,
  gid: string,
  window: number,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(qrSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const msg = `v${LIVE_QR_VERSION}.${eid}.${gid}.${window}`;
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time-ish compare of two equal-purpose hex strings.
export function sigEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// deno-lint-ignore no-explicit-any
export function buildTicketEmailHtml(entryOrEntries: any, event: any, tierName?: string | null): string {
  const entries = Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries];
  const passLink = `${appOrigin()}/pass/${event.id}`;
  const dateStr = formatEventDateLong(event.date);
  const venueParts = [event.venue_name, event.address].filter(Boolean).join(' · ');
  const title = escapeHtml(event.title);
  // Multi-ticket entries are named "Name (1 of 2)" — greet with the bare name.
  const guestName = escapeHtml(String(entries[0].guest_name || '').replace(/\s*\(\d+ of \d+\)$/, ''));
  const timeRange = formatTimeRange(event);
  // Apple Wallet: static events only (a Wallet pass cannot carry a live code),
  // and only once walletPass can sign. The link opens the signed-in pass page;
  // there is no unauthenticated pkpass endpoint.
  const walletLink = !event.live_qr && Deno.env.get('APPLE_PASS_TYPE_ID')
    ? `${passLink}?wallet=1`
    : '';

  // Live-pass events don't embed a scannable QR in email: the door only accepts
  // the rotating code, which has to be opened in the app. Static events keep the
  // single-use QR image so the email alone gets the guest in.
  const qrBlocks = event.live_qr
    ? `
    <div style="background:#15151f;border:1px solid #2a2a3a;border-radius:16px;padding:24px;text-align:center;">
      <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#ffffff;">${entries.length > 1 ? `You have ${entries.length} tickets` : 'Your ticket is ready'}</p>
      <p style="margin:0;font-size:13px;color:#b0b0c8;line-height:1.6;">This event uses live passes. Open your pass in the app at the door to get your entry code — it refreshes every few seconds, so there's nothing to screenshot.</p>
    </div>`
    // deno-lint-ignore no-explicit-any
    : entries.map((entry: any, i: number) => `
    <div style="background:#15151f;border:1px solid #2a2a3a;border-radius:16px;padding:24px;text-align:center;${i > 0 ? 'margin-top:16px;' : ''}">
      ${entries.length > 1 ? `<p style="margin:0 0 12px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#7a7a9a;">Ticket ${i + 1} of ${entries.length}</p>` : ''}
      <img src="${buildQrImageUrl(entry)}" alt="QR ticket ${i + 1}" width="240" height="240" style="display:block;margin:0 auto 16px;border-radius:12px;background:#ffffff;padding:8px;" />
      <p style="margin:0 0 6px;font-size:13px;color:#7a7a9a;">Show this code at the door</p>
      <p style="margin:0;font-size:11px;color:#5a5a7a;">Single-use · valid until first scan</p>
    </div>`).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a12;font-family:Inter,Segoe UI,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#0a0a12;color:#e8e8f0;padding:32px 24px;">
    <p style="margin:0 0 24px;font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#7a7a9a;text-align:center;">DoorMan · Ticket Confirmation</p>
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#ffffff;text-align:center;">${title}</h1>
    ${guestName ? `<p style="margin:0 0 24px;text-align:center;color:#b0b0c8;">Hi ${guestName},${entries.length > 1 ? ` here are your ${entries.length} tickets` : ''}</p>` : ''}
    ${entries.length > 1 ? `<p style="margin:0 0 16px;text-align:center;font-size:12px;color:#7a7a9a;">Each QR admits one person — forward or show them separately.</p>` : ''}
    ${qrBlocks}
    <div style="background:#15151f;border:1px solid #2a2a3a;border-radius:16px;padding:20px;margin-top:16px;">
      <p style="margin:0 0 12px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#7a7a9a;">Event Details</p>
      <div style="font-size:14px;color:#e8e8f0;line-height:1.7;">
        ${dateStr ? `<div><span style="color:#7a7a9a;">Date:</span> ${escapeHtml(dateStr)}</div>` : ''}
        ${timeRange ? `<div><span style="color:#7a7a9a;">Time:</span> ${escapeHtml(timeRange)}</div>` : ''}
        ${venueParts ? `<div><span style="color:#7a7a9a;">Venue:</span> ${escapeHtml(venueParts)}</div>` : ''}
        ${tierName ? `<div><span style="color:#7a7a9a;">Ticket:</span> ${escapeHtml(tierName)}</div>` : ''}
      </div>
    </div>
    <div style="text-align:center;margin:24px 0 20px;">
      <a href="${passLink}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;">View My Ticket</a>
    </div>
    ${walletLink ? `<p style="margin:0 0 16px;text-align:center;font-size:13px;color:#b0b0c8;">On iPhone? <a href="${walletLink}" style="color:#7c3aed;font-weight:600;">Add to Apple Wallet</a></p>` : ''}
    <p style="margin:0;text-align:center;font-size:11px;color:#5a5a7a;">Or visit <a href="${passLink}" style="color:#7c3aed;">${escapeHtml(appOrigin().replace(/^https?:\/\//, ''))}</a> — log in with the email you used to purchase.</p>
    ${emailFooter()}
  </div>
</body>
</html>`;
}

// Accepts one entry (re-send flow) or the full set from a multi-ticket order.
// deno-lint-ignore no-explicit-any
export async function sendTicketConfirmationEmail(
  _svc: SupabaseClient, entryOrEntries: any, event: any, tierName?: string | null,
): Promise<{ sent: boolean; error?: string }> {
  const entries = Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries];
  if (!entries[0]?.guest_email) return { sent: false, error: 'No guest email' };
  const html = buildTicketEmailHtml(entries, event, tierName);
  return await sendEmail({
    to: entries[0].guest_email,
    subject: entries.length > 1
      ? `Your ${entries.length} tickets for ${event.title}`
      : `Your ticket for ${event.title}`,
    html,
  });
}
