// Ticket pricing + QR + ticket-email helpers, ported from the original app's shared ticket helpers.
// All amounts are integer minor units end to end (the schema stores minor units,
// so the old toMinor/toMajor conversions on stored values are gone).
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { appOrigin, escapeHtml, formatEventDateLong, formatTimeRange, sendEmail } from './email.ts';

export const PLATFORM_FEE_FIXED_MINOR = 50; // 0.50 in minor units
export const PLATFORM_FEE_PERCENT = 0.04; // 4%
export const MIN_PAID_MINOR = 50; // minimum chargeable amount

export function toMajor(minor: number): number {
  return Number(minor) / 100;
}

export function computeFeeMinor(paidMinor: number): number {
  return PLATFORM_FEE_FIXED_MINOR + Math.round(PLATFORM_FEE_PERCENT * paidMinor);
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

// deno-lint-ignore no-explicit-any
export function buildTicketEmailHtml(entryOrEntries: any, event: any, tierName?: string | null): string {
  const entries = Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries];
  const passLink = `${appOrigin()}/pass/${event.id}`;
  const dateStr = formatEventDateLong(event.date);
  const venueParts = [event.venue_name, event.address].filter(Boolean).join(' · ');
  const title = escapeHtml(event.title);
  const guestName = escapeHtml(entries[0].guest_name);
  const timeRange = formatTimeRange(event);

  // deno-lint-ignore no-explicit-any
  const qrBlocks = entries.map((entry: any, i: number) => `
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
  <div style="max-width:480px;margin:0 auto;background:#0a0a12;color:#e8e8f0;padding:32px 24px 48px;">
    <p style="margin:0 0 24px;font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#7a7a9a;text-align:center;">DoorMan · Ticket Confirmation</p>
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#ffffff;text-align:center;">${title}</h1>
    ${guestName ? `<p style="margin:0 0 24px;text-align:center;color:#b0b0c8;">Hi ${guestName}${entries.length > 1 ? ` · ${entries.length} tickets` : ''}</p>` : ''}
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
    <div style="text-align:center;margin:24px 0 8px;">
      <a href="${passLink}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;">View My Ticket</a>
    </div>
    <p style="margin:8px 0 0;text-align:center;font-size:11px;color:#5a5a7a;">Or visit <a href="${passLink}" style="color:#7c3aed;">${escapeHtml(appOrigin().replace(/^https?:\/\//, ''))}</a> — log in with the email you used to purchase.</p>
    <p style="margin:32px 0 0;text-align:center;font-size:10px;color:#3a3a4a;">Powered by DoorMan</p>
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
